// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { SegmentType } from '@fmgc/flightplanning/FlightPlanSegment';
import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { Guidable } from '@fmgc/guidance/Guidable';
import { distanceTo } from 'msfs-geo';
import { Waypoint } from 'msfs-navdata';
import { TurnDirection } from '@fmgc/types/fstypes/FSEnums';
import { LegMetadata } from '@fmgc/guidance/lnav/legs/index';

export abstract class Leg extends Guidable {
    segment: SegmentType;

    abstract readonly metadata: Readonly<LegMetadata>

    get constrainedTurnDirection() {
        return this.metadata.turnDirection;
    }

    abstract get inboundCourse(): Degrees | undefined;

    abstract get outboundCourse(): Degrees | undefined;

    abstract get terminationWaypoint(): Waypoint | Coordinates | undefined;

    abstract get ident(): string

    displayedOnMap: boolean = true

    get disableAutomaticSequencing(): boolean {
        return false;
    }

    /** @inheritDoc */
    recomputeWithParameters(_isActive: boolean, _tas: Knots, _gs: Knots, _ppos: Coordinates, _trueTrack: DegreesTrue, _previousGuidable: Guidable, _nextGuidable: Guidable): void {
        // Default impl.
    }

    get distance(): NauticalMiles {
        return distanceTo(this.getPathStartPoint(), this.getPathEndPoint());
    }

    abstract get distanceToTermination(): NauticalMiles

    get overflyTermFix(): boolean {
        return false;
    }
}
