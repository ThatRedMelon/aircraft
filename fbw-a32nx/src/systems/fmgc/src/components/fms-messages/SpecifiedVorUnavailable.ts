import { NavaidTuner } from '@fmgc/navigation/NavaidTuner';
import { FMMessage, FMMessageTypes } from '@shared/FmMessages';
import { Trigger } from '@shared/logic';
import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';

abstract class SpecifiedVorUnavailable implements FMMessageSelector {
    message: FMMessage = FMMessageTypes.SpecifiedVorDmeUnavailble;

    abstract efisSide: 'L' | 'R';

    private trigRising = new Trigger(true);

    private trigFalling = new Trigger(true);

    private navaidTuner: NavaidTuner;

    init(baseInstrument: BaseInstrument): void {
        this.navaidTuner = baseInstrument.navigation.getNavaidTuner();
    }

    process(deltaTime: number): FMMessageUpdate {
        const message = this.navaidTuner.getSpecifiedVorMessage();

        this.trigRising.input = message;
        this.trigRising.update(deltaTime);

        this.trigFalling.input = !message;
        this.trigFalling.update(deltaTime);

        if (this.trigRising.output) {
            return FMMessageUpdate.SEND;
        }

        if (this.trigFalling.output) {
            return FMMessageUpdate.RECALL;
        }

        return FMMessageUpdate.NO_ACTION;
    }
}

export class SpecifiedVorUnavailableLeft extends SpecifiedVorUnavailable {
    efisSide: 'L' | 'R' = 'L';
}

export class SpecifiedVorUnavailableRight extends SpecifiedVorUnavailable {
    efisSide: 'L' | 'R' = 'R';
}
