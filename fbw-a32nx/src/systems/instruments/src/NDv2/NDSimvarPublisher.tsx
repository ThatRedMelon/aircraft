import { EventBus, SimVarDefinition, SimVarValueType } from '@microsoft/msfs-sdk';
import {
    AdirsSimVarDefinitions,
    AdirsSimVars,
    SwitchingPanelSimVarsDefinitions,
    SwitchingPanelVSimVars,
} from '../MsfsAvionicsCommon/SimVarTypes';
import { UpdatableSimVarPublisher } from '../MsfsAvionicsCommon/UpdatableSimVarPublisher';

export type NDSimvars = AdirsSimVars & SwitchingPanelVSimVars & {
    elec: boolean;
    elecFo: boolean;
    potentiometerCaptain: number;
    potentiometerFo: number;
    toWptIdent0Captain: number;
    toWptIdent1Captain: number;
    toWptBearingCaptain: Degrees;
    toWptTrueBearingCaptain: Degrees,
    toWptDistanceCaptain: Degrees;
    toWptEtaCaptain: Seconds;
    apprMessage0Captain: number;
    apprMessage1Captain: number;
    ilsCourse: number;
    selectedWaypointLat: Degrees;
    selectedWaypointLong: Degrees;
    selectedHeading: Degrees;
    pposLat: Degrees;
    pposLong: Degrees;
    absoluteTime: Seconds;
  }

export enum NDVars {
    elec = 'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED',
    elecFo = 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED',
    potentiometerCaptain = 'LIGHT POTENTIOMETER:89',
    potentiometerFo = 'LIGHT POTENTIOMETER:91',
    toWptIdent0Captain = 'L:A32NX_EFIS_L_TO_WPT_IDENT_0',
    toWptIdent1Captain = 'L:A32NX_EFIS_L_TO_WPT_IDENT_1',
    toWptBearingCaptain = 'L:A32NX_EFIS_L_TO_WPT_BEARING',
    toWptTrueBearingCaptain = 'L:A32NX_EFIS_L_TO_WPT_TRUE_BEARING',
    toWptDistanceCaptain = 'L:A32NX_EFIS_L_TO_WPT_DISTANCE',
    toWptEtaCaptain = 'L:A32NX_EFIS_L_TO_WPT_ETA',
    apprMessage0Captain = 'L:A32NX_EFIS_L_APPR_MSG_0',
    apprMessage1Captain = 'L:A32NX_EFIS_L_APPR_MSG_1',
    ilsCourse = 'L:A32NX_FM_LS_COURSE',
    selectedWaypointLat = 'L:A32NX_SELECTED_WAYPOINT_LAT',
    selectedWaypointLong = 'L:A32NX_SELECTED_WAYPOINT_LONG',
    selectedHeading = 'L:A32NX_FCU_HEADING_SELECTED',
    pposLat = 'PLANE LATITUDE', // TODO replace with fm position
    pposLong = 'PLANE LONGITUDE', // TODO replace with fm position
    absoluteTime = 'E:ABSOLUTE TIME',
}

/** A publisher to poll and publish nav/com simvars. */
export class NDSimvarPublisher extends UpdatableSimVarPublisher<NDSimvars> {
    private static simvars = new Map<keyof NDSimvars, SimVarDefinition>([
        ...AdirsSimVarDefinitions,
        ...SwitchingPanelSimVarsDefinitions,
        ['elec', { name: NDVars.elec, type: SimVarValueType.Bool }],
        ['elecFo', { name: NDVars.elecFo, type: SimVarValueType.Bool }],
        ['potentiometerCaptain', { name: NDVars.potentiometerCaptain, type: SimVarValueType.Number }],
        ['potentiometerFo', { name: NDVars.potentiometerFo, type: SimVarValueType.Number }],
        ['toWptIdent0Captain', { name: NDVars.toWptIdent0Captain, type: SimVarValueType.Number }],
        ['toWptIdent1Captain', { name: NDVars.toWptIdent1Captain, type: SimVarValueType.Number }],
        ['toWptBearingCaptain', { name: NDVars.toWptBearingCaptain, type: SimVarValueType.Degree }],
        ['toWptTrueBearingCaptain', { name: NDVars.toWptTrueBearingCaptain, type: SimVarValueType.Degree }],
        ['toWptDistanceCaptain', { name: NDVars.toWptDistanceCaptain, type: SimVarValueType.Number }],
        ['toWptEtaCaptain', { name: NDVars.toWptEtaCaptain, type: SimVarValueType.Seconds }],
        ['apprMessage0Captain', { name: NDVars.apprMessage0Captain, type: SimVarValueType.Number }],
        ['apprMessage1Captain', { name: NDVars.apprMessage1Captain, type: SimVarValueType.Number }],
        ['ilsCourse', { name: NDVars.ilsCourse, type: SimVarValueType.Number }],
        ['selectedWaypointLat', { name: NDVars.selectedWaypointLat, type: SimVarValueType.Degree }],
        ['selectedWaypointLong', { name: NDVars.selectedWaypointLong, type: SimVarValueType.Degree }],
        ['selectedHeading', { name: NDVars.selectedHeading, type: SimVarValueType.Degree }],
        ['pposLat', { name: NDVars.pposLat, type: SimVarValueType.Degree }],
        ['pposLong', { name: NDVars.pposLong, type: SimVarValueType.Degree }],
        ['absoluteTime', { name: NDVars.absoluteTime, type: SimVarValueType.Seconds }],
    ])

    public constructor(bus: EventBus) {
        super(NDSimvarPublisher.simvars, bus);
    }
}
