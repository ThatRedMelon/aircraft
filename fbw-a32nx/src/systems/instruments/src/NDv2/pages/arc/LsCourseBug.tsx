import { FSComponent, DisplayComponent, MappedSubject, Subject, Subscribable, VNode, ConsumerSubject } from '@microsoft/msfs-sdk';
import { DmcEvents } from 'instruments/src/MsfsAvionicsCommon/providers/DmcPublisher';
import { ArincEventBus } from 'instruments/src/MsfsAvionicsCommon/ArincEventBus';
import { FcuSimVars } from 'instruments/src/MsfsAvionicsCommon/providers/FcuBusPublisher';
import { NDSimvars } from '../../NDSimvarPublisher';
import { getSmallestAngle } from '../../../PFD/PFDUtils';
import { Arinc429ConsumerSubject } from '../../../MsfsAvionicsCommon/Arinc429ConsumerSubject';

export interface LsCourseBugProps {
    bus: ArincEventBus,
    rotationOffset: Subscribable<number>,
}

export class LsCourseBug extends DisplayComponent<LsCourseBugProps> {
    private readonly diffSubject = Subject.create(0);

    private readonly headingWord = Arinc429ConsumerSubject.create(null).pause();

    private readonly lsCourse = ConsumerSubject.create(null, 0).pause();

    private readonly efisLsActive = ConsumerSubject.create(null, false);

    private readonly bugShown = MappedSubject.create(
        ([headingWord, lsCourse, diff, efisLsActive]) => efisLsActive && headingWord.isNormalOperation() && lsCourse >= 0 && Math.abs(diff) <= 48,
        this.headingWord,
        this.lsCourse,
        this.diffSubject,
        this.efisLsActive,
    );

    onAfterRender(node: VNode) {
        super.onAfterRender(node);

        const sub = this.props.bus.getArincSubscriber<DmcEvents & FcuSimVars & NDSimvars>();

        this.headingWord.setConsumer(sub.on('heading').withArinc429Precision(2));

        this.headingWord.sub((_h) => this.handleDisplay());

        this.lsCourse.sub(this.handleDisplay.bind(this));

        this.lsCourse.setConsumer(sub.on('ilsCourse'));

        this.efisLsActive.sub((ls) => {
            if (ls) {
                this.headingWord.resume();
                this.lsCourse.resume();
                this.handleDisplay();
            } else {
                this.headingWord.pause();
                this.lsCourse.pause();
            }
        });

        this.efisLsActive.setConsumer(sub.on('efisLsActive'));
    }

    private handleDisplay() {
        const headingValid = this.headingWord.get().isNormalOperation();

        if (headingValid) {
            const diff = getSmallestAngle(this.lsCourse.get(), this.headingWord.get().value);

            this.diffSubject.set(diff + this.props.rotationOffset.get());
        }
    }

    render(): VNode | null {
        return (
            <>
                <g
                    visibility={this.bugShown.map((v) => (v ? '' : 'hidden'))}
                    transform={this.diffSubject.map((diff) => `rotate(${diff} 384 620)`)}
                >
                    <line x1={376} y1={114} x2={392} y2={114} class="rounded shadow" stroke-width={2.5} />
                    <line x1={384} y1={122} x2={384} y2={74} class="rounded shadow" stroke-width={2.5} />

                    <line x1={376} y1={114} x2={392} y2={114} class="rounded Magenta" stroke-width={2.5} />
                    <line x1={384} y1={122} x2={384} y2={74} class="rounded Magenta" stroke-width={2.5} />
                </g>
            </>
        );
    }
}
