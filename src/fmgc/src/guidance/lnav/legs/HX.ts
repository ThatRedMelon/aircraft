// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0
/* eslint-disable max-classes-per-file */

import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { GuidanceParameters, LateralPathGuidance } from '@fmgc/guidance/ControlLaws';
import { Geometry } from '@fmgc/guidance/Geometry';
import { AltitudeDescriptor, TurnDirection } from '@fmgc/types/fstypes/FSEnums';
import { SegmentType } from '@fmgc/wtsdk';
import { arcDistanceToGo, arcGuidance, courseToFixDistanceToGo, courseToFixGuidance, maxBank } from '@fmgc/guidance/lnav/CommonGeometry';
import { Guidable } from '@fmgc/guidance/Guidable';
import { XFLeg } from '@fmgc/guidance/lnav/legs/XF';
import { LnavConfig } from '@fmgc/guidance/LnavConfig';
import { MathUtils } from '@shared/MathUtils';
import { AltitudeConstraintType, LegMetadata } from '@fmgc/guidance/lnav/legs/index';
import { Waypoint } from 'msfs-navdata';
import { fixCoordinates } from '@fmgc/flightplanning/new/utils';
import { PathVector, PathVectorType } from '../PathVector';

interface HxGeometry {
    fixA: LatLongAlt,
    fixB: LatLongAlt,
    fixC: LatLongAlt,
    arcCentreFix1: LatLongAlt,
    arcCentreFix2: LatLongAlt,
    sweepAngle: Degrees,
}

export enum HxLegGuidanceState {
    Inbound,
    Arc1,
    Outbound,
    Arc2,
}

export class HMLeg extends XFLeg {
    // TODO consider different entries for initial state...
    // TODO make protected when done with DebugHXLeg
    public state: HxLegGuidanceState = HxLegGuidanceState.Inbound;

    protected initialState: HxLegGuidanceState = HxLegGuidanceState.Inbound;

    protected transitionEndPoint: Coordinates;

    protected termConditionMet: boolean = false;

    /**
     * TAS used for the current prediction
     */
    public predictedSpeed: Knots;

    protected geometry: HxGeometry;

    private immExitLength: NauticalMiles;

    private immExitRequested = false;

    constructor(
        public to: Waypoint,
        public course: DegreesTrue,
        public holdDistance: NauticalMiles,
        public holdDistanceInMinutes: NauticalMiles,
        public metadata: LegMetadata,
        public segment: SegmentType,
    ) {
        super(to);

        this.predictedSpeed = this.targetSpeed();

        this.geometry = this.computeGeometry();
    }

    get inboundLegCourse(): DegreesTrue {
        // TODO port over
        return 0;
    }

    get outboundLegCourse(): DegreesTrue {
        return (this.inboundLegCourse + 180) % 360;
    }

    get turnDirection(): TurnDirection {
        return this.metadata.turnDirection;
    }

    get ident(): string {
        return this.to.ident;
    }

    /**
     * Used by hold entry transition to set our initial state depending on entry type
     * @param initialState
     */
    setInitialState(initialState: HxLegGuidanceState): void {
        // TODO check if already active and deny...
        this.state = initialState;
        this.initialState = initialState;
    }

    setTransitionEndPoint(endPoint: Coordinates): void {
        this.transitionEndPoint = endPoint;
    }

    /**
     * Use for IMM EXIT set/reset function on the MCDU
     * Note: if IMM EXIT is set before this leg is active it should be deleted from the f-pln instead
     * @param
     */
    setImmediateExit(exit: boolean, ppos: LatLongData, tas: Knots): void {
        if (exit) {
            switch (this.state) {
            case HxLegGuidanceState.Arc1:
                // let's do a circle
                this.immExitLength = 0;
                break;
            case HxLegGuidanceState.Outbound:
                const { fixA, sweepAngle } = this.computeGeometry();
                const nextPhi = sweepAngle > 0 ? maxBank(tas, true) : -maxBank(tas, true);
                // TODO maybe need a little anticipation distance added.. we will start off with XTK and should already be at or close to max bank...
                const rad = Geometry.getRollAnticipationDistance(tas, 0, nextPhi);
                this.immExitLength = rad + courseToFixDistanceToGo(ppos, this.inboundLegCourse, fixA);
                break;
            case HxLegGuidanceState.Arc2:
            case HxLegGuidanceState.Inbound:
                // keep the normal leg distance as we can't shorten
                this.immExitLength = this.computeLegDistance();
                break;
            // no default
            }
        }

        // hack to allow f-pln page to see state
        this.to.additionalData.immExit = exit;

        this.immExitRequested = exit;

        // if resuming hold, the geometry will be recomputed on the next pass of the hold fix
        if (exit) {
            this.geometry = this.computeGeometry();
        }
    }

    /**
     * Compute target speed in KTAS
     * @todo temp until vnav can give this
     * @returns
     */
    targetSpeed(): Knots {
        // TODO unhax, need altitude => speed from vnav if not coded
        const alt = this.to.legAltitude1 ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet');
        // FIXME we assume ISA atmosphere for now, and that we're holding below the tropopause
        const temperature = 288.15 - 0.0019812 * alt;
        const pressure = 1013.25 * (temperature / 288.15) ** 5.25588;

        const greenDot = SimVar.GetSimVarValue('L:A32NX_SPEEDS_GD', 'number');
        let kcas = greenDot > 0 ? greenDot : 220;
        if (this.to.speedConstraint > 100) {
            kcas = Math.min(kcas, this.to.speedConstraint);
        }
        // apply icao limits
        if (alt < 14000) {
            kcas = Math.min(230, kcas);
        } else if (alt < 20000) {
            kcas = Math.min(240, kcas);
        } else if (alt < 34000) {
            kcas = Math.min(265, kcas);
        } else {
            kcas = Math.min(
                MathUtils.convertMachToKCas(0.83, temperature, pressure),
                kcas,
            );
        }
        // TODO apply speed limit/alt

        return MathUtils.convertKCasToKTAS(kcas, temperature, pressure);
    }

    get outboundStartPoint(): Coordinates {
        const { fixB } = this.computeGeometry();
        return fixB;
    }

    public computeLegDistance(): NauticalMiles {
        if (this.immExitRequested) {
            return this.immExitLength;
        }
        // is distance in NM?
        if (this.holdDistance > 0) {
            return this.holdDistance;
        }

        // distance is in time then...
        const defaultMinutes = this.to.legAltitude1 ? 1 : 1.5;
        return (this.holdDistanceInMinutes > 0 ? this.holdDistanceInMinutes : defaultMinutes) * this.predictedSpeed / 60;
    }

    protected computeGeometry(): HxGeometry {
        /*
         * We define some fixes at the turning points around the hippodrome like so (mirror vertically for left turn):
         *         A          B
         *         *----------*
         *       /              \
         * arc1 |  *          *  | arc2
         *       \              /
         *         *<---------*
         *      hold fix      C
         */

        // TODO calculate IMM EXIT shortened leg if necessary

        const distance = this.computeLegDistance();
        const radius = this.radius;
        const leftTurn = this.turnDirection === TurnDirection.Left;

        const fixA = Avionics.Utils.bearingDistanceToCoordinates(this.inboundLegCourse + (leftTurn ? -90 : 90), radius * 2, fixCoordinates(this.to.location).lat, fixCoordinates(this.to.location).long);
        const fixB = Avionics.Utils.bearingDistanceToCoordinates(this.outboundLegCourse, distance, fixA.lat, fixA.long);
        const fixC = Avionics.Utils.bearingDistanceToCoordinates(this.outboundLegCourse, distance, fixCoordinates(this.to.location).lat, fixCoordinates(this.to.location).long);

        const arcCentreFix1 = Avionics.Utils.bearingDistanceToCoordinates(this.inboundLegCourse + (leftTurn ? -90 : 90), radius, fixCoordinates(this.to.location).lat, fixCoordinates(this.to.location).long);
        const arcCentreFix2 = Avionics.Utils.bearingDistanceToCoordinates(this.inboundLegCourse + (leftTurn ? -90 : 90), radius, fixC.lat, fixC.long);

        return {
            fixA,
            fixB,
            fixC,
            arcCentreFix1,
            arcCentreFix2,
            sweepAngle: leftTurn ? -180 : 180,
        };
    }

    get radius(): NauticalMiles {
        // TODO account for wind
        const gsMs = this.predictedSpeed / 1.94384;
        const radius = (gsMs ** 2 / (9.81 * Math.tan(maxBank(this.predictedSpeed, true) * Math.PI / 180)) / 1852) * LnavConfig.TURN_RADIUS_FACTOR;

        return radius;
    }

    get terminationPoint(): LatLongAlt {
        return fixCoordinates(this.to.location);
    }

    get distance(): NauticalMiles {
        // TODO fix...
        return this.computeLegDistance() * 4;
    }

    get inboundCourse(): Degrees {
        return this.inboundLegCourse;
    }

    get outboundCourse(): Degrees {
        return this.inboundLegCourse;
    }

    get startsInCircularArc(): boolean {
        // this is intended to be used only for entry...
        return this.state === HxLegGuidanceState.Arc1 || this.state === HxLegGuidanceState.Arc2;
    }

    /**
     *
     * @param tas
     * @returns
     */
    public getNominalRollAngle(gs: Knots): Degrees {
        return this.endsInCircularArc ? maxBank(gs, true) : 0;
    }

    protected getDistanceToGoThisOrbit(ppos: LatLongData): NauticalMiles {
        const { fixB, arcCentreFix1, arcCentreFix2, sweepAngle } = this.geometry;

        switch (this.state) {
        case HxLegGuidanceState.Inbound:
            return courseToFixDistanceToGo(ppos, this.inboundLegCourse, fixCoordinates(this.to.location));
        case HxLegGuidanceState.Arc1:
            return arcDistanceToGo(ppos, fixCoordinates(this.to.location), arcCentreFix1, sweepAngle) + this.computeLegDistance() * 2 + this.radius * Math.PI;
        case HxLegGuidanceState.Outbound:
            return courseToFixDistanceToGo(ppos, this.outboundLegCourse, fixB) + this.computeLegDistance() + this.radius * Math.PI;
        case HxLegGuidanceState.Arc2:
            return arcDistanceToGo(ppos, fixB, arcCentreFix2, sweepAngle) + this.computeLegDistance();
        // no default
        }

        return 1;
    }

    getDistanceToGo(ppos: LatLongData): NauticalMiles {
        return this.getDistanceToGoThisOrbit(ppos);
    }

    get predictedPath(): PathVector[] {
        const { fixA, fixB, fixC, arcCentreFix1, arcCentreFix2, sweepAngle } = this.geometry;

        return [
            {
                type: PathVectorType.Arc,
                startPoint: fixCoordinates(this.to.location),
                centrePoint: arcCentreFix1,
                endPoint: fixA,
                sweepAngle,
            },
            {
                type: PathVectorType.Line,
                startPoint: fixA,
                endPoint: fixB,
            },
            {
                type: PathVectorType.Arc,
                startPoint: fixB,
                centrePoint: arcCentreFix2,
                endPoint: fixC,
                sweepAngle,
            },
            {
                type: PathVectorType.Line,
                startPoint: fixC,
                endPoint: fixCoordinates(this.to.location),
            },
        ];
    }

    updateState(ppos: LatLongAlt, tas: Knots, geometry: HxGeometry): void {
        let dtg = 0;

        // TODO divide up into sectors and choose based on that?

        switch (this.state) {
        case HxLegGuidanceState.Inbound: {
            dtg = courseToFixDistanceToGo(ppos, this.inboundLegCourse, fixCoordinates(this.to.location));
            break;
        }
        case HxLegGuidanceState.Arc1: {
            dtg = arcDistanceToGo(ppos, fixCoordinates(this.to.location), geometry.arcCentreFix1, geometry.sweepAngle);
            break;
        }
        case HxLegGuidanceState.Outbound: {
            dtg = courseToFixDistanceToGo(ppos, this.outboundLegCourse, geometry.fixB);
            break;
        }
        case HxLegGuidanceState.Arc2: {
            dtg = arcDistanceToGo(ppos, geometry.fixB, geometry.arcCentreFix2, geometry.sweepAngle);
            break;
        }
        default:
            throw new Error(`Bad HxLeg state ${this.state}`);
        }

        if (dtg <= 0) {
            if (this.state === HxLegGuidanceState.Inbound) {
                if (this.immExitRequested) {
                    return;
                }
                this.updatePrediction(tas);
            }
            this.state = (this.state + 1) % (HxLegGuidanceState.Arc2 + 1);
            console.log(`HX switched to state ${HxLegGuidanceState[this.state]}`);
        }
    }

    getGuidanceParameters(ppos: LatLongAlt, trueTrack: Degrees, tas: Knots): GuidanceParameters {
        const { fixB, arcCentreFix1, arcCentreFix2, sweepAngle } = this.geometry;

        this.updateState(ppos, tas, this.geometry);

        let params: LateralPathGuidance;
        let dtg: NauticalMiles;
        let nextPhi = 0;
        let prevPhi = 0;

        switch (this.state) {
        case HxLegGuidanceState.Inbound:
            params = courseToFixGuidance(ppos, trueTrack, this.inboundLegCourse, fixCoordinates(this.to.location));
            dtg = courseToFixDistanceToGo(ppos, this.inboundLegCourse, fixCoordinates(this.to.location));
            nextPhi = sweepAngle > 0 ? maxBank(tas, true) : -maxBank(tas, true);
            break;
        case HxLegGuidanceState.Arc1:
            params = arcGuidance(ppos, trueTrack, fixCoordinates(this.to.location), arcCentreFix1, sweepAngle);
            dtg = arcDistanceToGo(ppos, fixCoordinates(this.to.location), arcCentreFix1, sweepAngle);
            prevPhi = params.phiCommand;
            break;
        case HxLegGuidanceState.Outbound:
            params = courseToFixGuidance(ppos, trueTrack, this.outboundLegCourse, fixB);
            dtg = courseToFixDistanceToGo(ppos, this.outboundLegCourse, fixB);
            nextPhi = sweepAngle > 0 ? maxBank(tas, true) : -maxBank(tas, true);
            break;
        case HxLegGuidanceState.Arc2:
            params = arcGuidance(ppos, trueTrack, fixB, arcCentreFix2, sweepAngle);
            dtg = arcDistanceToGo(ppos, fixB, arcCentreFix2, sweepAngle);
            prevPhi = params.phiCommand;
            break;
        default:
            throw new Error(`Bad HxLeg state ${this.state}`);
        }

        const rad = Geometry.getRollAnticipationDistance(tas, prevPhi, nextPhi);
        if (dtg <= rad) {
            params.phiCommand = nextPhi;
        }

        return params;
    }

    recomputeWithParameters(isActive: boolean, _tas: Knots, _gs: Knots, _ppos: Coordinates, _trueTrack: DegreesTrue, _previousGuidable: Guidable, _nextGuidable: Guidable): void {
        // TODO store IMM EXIT point and termConditionMet flag, consider changes to hold params
        // console.log(this.predictedPath);
        if (!isActive) {
            this.updatePrediction(this.predictedSpeed);
        }
    }

    /**
     * Should be called on each crossing of the hold fix
     */
    updatePrediction(tas: number) {
        this.predictedSpeed = tas;
        this.geometry = this.computeGeometry();

        // hack to allow f-pln page to show the speed
        // TODO unhax, need altitude => speed from vnav if not coded
        const alt = this.to.legAltitude1 ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet');
        // FIXME we assume ISA atmosphere for now, and that we're holding below the tropopause
        const temperature = 288.15 - 0.0019812 * alt;
        const pressure = 1013.25 * (temperature / 288.15) ** 5.25588;
        this.to.additionalData.holdSpeed = MathUtils.convertTasToKCas(this.predictedSpeed, temperature, pressure);
    }

    // TODO are we even using this? What exactly should it tell us?
    isAbeam(_ppos: Coordinates) {
        return false;
    }

    getPathStartPoint(): Coordinates {
        return fixCoordinates(this.to.location);
    }

    getPathEndPoint(): Coordinates {
        // TODO consider early exit to CF on HF leg
        return fixCoordinates(this.to.location);
    }

    get disableAutomaticSequencing(): boolean {
        return !this.immExitRequested;
    }

    get repr(): string {
        return `${this.constructor.name.substr(0, 2)} '${this.to.ident}' ${TurnDirection[this.turnDirection]}`;
    }
}

export class HALeg extends HMLeg {
    private targetAltitude: Feet;

    constructor(
        public to: Waypoint,
        public metadata: LegMetadata,
        public segment: SegmentType,
    ) {
        super(to, metadata, segment);

        // the term altitude is guaranteed to be at or above, and in field altitude1, by ARINC424 coding rules
        if (this.metadata.altitudeConstraint.type !== AltitudeConstraintType.atOrAbove) {
            console.warn(`HALeg invalid altitude descriptor ${this.metadata.altitudeConstraint.type}, must be ${AltitudeDescriptor.AtOrAbove}`);
        }
        this.targetAltitude = this.metadata.altitudeConstraint.altitude1;
    }

    getGuidanceParameters(ppos: LatLongAlt, trueTrack: Degrees, tas: Knots): GuidanceParameters {
        // TODO get altitude, check for at or above our target
        // TODO do we need to force at least one circuit if already at the term altitude on entry? honeywell doc covers this..
        // FIXME use FMGC position data
        this.termConditionMet = SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') >= this.targetAltitude;

        return super.getGuidanceParameters(ppos, trueTrack, tas);
    }

    getDistanceToGo(ppos: LatLongData): NauticalMiles {
        if (this.termConditionMet) {
            return this.getDistanceToGoThisOrbit(ppos);
        }
        // TODO compute distance until alt (vnav) + remainder of last orbit
        return 42;
    }

    recomputeWithParameters(_isActive: boolean, _tas: Knots, _gs: Knots, _ppos: Coordinates, _trueTrack: DegreesTrue, _previousGuidable: Guidable, _nextGuidable: Guidable): void {
        this.termConditionMet = SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') >= this.targetAltitude;
    }

    get disableAutomaticSequencing(): boolean {
        return false;
    }

    get predictedPath(): PathVector[] {
        if (!this.termConditionMet) {
            return super.predictedPath;
        }

        const { fixA, fixB, fixC, arcCentreFix1, arcCentreFix2, sweepAngle } = this.computeGeometry();

        const path = [];

        path.push({
            type: PathVectorType.Line,
            startPoint: fixC,
            endPoint: fixCoordinates(this.to.location),
        });

        if (this.state === HxLegGuidanceState.Inbound) {
            return path;
        }

        path.push({
            type: PathVectorType.Arc,
            startPoint: fixB,
            centrePoint: arcCentreFix2,
            endPoint: fixC,
            sweepAngle,
        });

        if (this.state === HxLegGuidanceState.Arc2) {
            return path;
        }

        path.push({
            type: PathVectorType.Line,
            startPoint: fixA,
            endPoint: fixB,
        });

        if (this.state === HxLegGuidanceState.Outbound) {
            return path;
        }

        path.push({
            type: PathVectorType.Arc,
            startPoint: fixCoordinates(this.to.location),
            centrePoint: arcCentreFix1,
            endPoint: fixA,
            sweepAngle,
        });

        return path;
    }
}

export class HFLeg extends HMLeg {
    // TODO special predicted path for early exit to CF

    getGuidanceParameters(ppos: LatLongAlt, trueTrack: Degrees, tas: Knots): GuidanceParameters {
        // always terminate on first crossing of holding fix after entry
        this.termConditionMet = true;
        return super.getGuidanceParameters(ppos, trueTrack, tas);
    }

    getDistanceToGo(ppos: LatLongData): NauticalMiles {
        // TODO early exit to CF leg...
        return super.getDistanceToGoThisOrbit(ppos);
    }

    get disableAutomaticSequencing(): boolean {
        return false;
    }

    get predictedPath(): PathVector[] {
        const { fixA, fixB, fixC, arcCentreFix1, arcCentreFix2, sweepAngle } = this.computeGeometry();

        const path = [];

        path.push({
            type: PathVectorType.Line,
            startPoint: fixC,
            endPoint: fixCoordinates(this.to.location),
        });

        if (this.initialState === HxLegGuidanceState.Inbound) {
            if (this.transitionEndPoint) {
                path[0].startPoint = this.transitionEndPoint;
            }
            return path;
        }

        path.push({
            type: PathVectorType.Arc,
            startPoint: fixB,
            centrePoint: arcCentreFix2,
            endPoint: fixC,
            sweepAngle,
        });

        if (this.initialState === HxLegGuidanceState.Arc2) {
            if (this.transitionEndPoint) {
                path[1].startPoint = this.transitionEndPoint;
            }
            return path;
        }

        path.push({
            type: PathVectorType.Line,
            startPoint: fixA,
            endPoint: fixB,
        });

        if (this.initialState === HxLegGuidanceState.Outbound) {
            if (this.transitionEndPoint) {
                path[2].startPoint = this.transitionEndPoint;
            }
            return path;
        }

        path.push({
            type: PathVectorType.Arc,
            startPoint: fixCoordinates(this.to.location),
            centrePoint: arcCentreFix1,
            endPoint: fixA,
            sweepAngle,
        });

        if (this.transitionEndPoint) {
            path[3].startPoint = this.transitionEndPoint;
        }

        return path;
    }
}
