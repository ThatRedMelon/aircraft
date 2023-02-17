use std::time::Duration;
use uom::si::{f64::*, pressure::psi, ratio::ratio};

use crate::{
    shared::{
        low_pass_filter::LowPassFilter, random_from_normal_distribution, ElectricalBusType,
        ElectricalBuses,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use super::{PressureSwitch, PressureSwitchState, PressureSwitchType};

struct ReverserActuator {
    position: Ratio,
    current_speed: LowPassFilter<Ratio>,
    nominal_speed: f64,

    nominal_pressure: Pressure,
}
impl ReverserActuator {
    const NOMINAL_SPEED_RATIO_PER_S: f64 = 0.6;
    const SPEED_RATIO_STD_DEVIATION: f64 = 0.05;

    const SPEED_TIME_CONSTANT: Duration = Duration::from_millis(250);

    fn new(nominal_pressure: Pressure) -> Self {
        Self {
            position: Ratio::default(),
            current_speed: LowPassFilter::new(Self::SPEED_TIME_CONSTANT),
            nominal_speed: random_from_normal_distribution(
                Self::NOMINAL_SPEED_RATIO_PER_S,
                Self::SPEED_RATIO_STD_DEVIATION,
            ),
            nominal_pressure,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        pressure: Pressure,
        is_mechanically_locked: bool,
    ) {
        self.update_current_speed(context, pressure, is_mechanically_locked);

        println!(
            "ACTUATOR: islocked{:?} speed {:.2} position {:.3}",
            is_mechanically_locked,
            self.current_speed.output().get::<ratio>(),
            self.position.get::<ratio>()
        );

        self.position += context.delta_as_secs_f64() * self.current_speed.output();

        if self.current_speed.output().get::<ratio>() > 0. && self.position.get::<ratio>() >= 1.
            || self.current_speed.output().get::<ratio>() < 0. && self.position.get::<ratio>() <= 0.
        {
            self.current_speed.reset(Ratio::default());
        }

        self.position = self
            .position
            .max(Ratio::default())
            .min(Ratio::new::<ratio>(1.));
    }

    fn update_current_speed(
        &mut self,
        context: &UpdateContext,
        pressure: Pressure,
        is_mechanically_locked: bool,
    ) {
        if is_mechanically_locked {
            self.current_speed.reset(Ratio::default());
        } else {
            self.current_speed
                .update(context.delta(), self.max_speed_from_pressure(pressure));
        }
    }

    fn max_speed_from_pressure(&self, pressure: Pressure) -> Ratio {
        let pressure_ratio: Ratio = pressure / self.nominal_pressure;

        pressure_ratio * self.nominal_speed
    }

    fn position(&self) -> Ratio {
        self.position
    }
}

struct ElectricalLock {
    is_locked: bool,
    is_powered: bool,
    powered_by: ElectricalBusType,
}
impl ElectricalLock {
    fn new(powered_by: ElectricalBusType) -> Self {
        Self {
            is_locked: true,
            is_powered: false,
            powered_by,
        }
    }

    fn update(&mut self, controller: &impl ReverserInterface, actuator_position: Ratio) {
        let is_locking = !controller.should_unlock() || !self.is_powered;

        self.is_locked = is_locking && actuator_position.get::<ratio>() < 0.01;
    }

    fn is_locked(&self) -> bool {
        self.is_locked
    }
}
impl SimulationElement for ElectricalLock {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by)
    }
}

//TODO remove valve duplication from gear system

#[derive(PartialEq, Clone, Copy)]
enum HydraulicValveType {
    ClosedWhenOff,
    _OpenedWhenOff,
    Mechanical,
}

struct HydraulicValve {
    position: LowPassFilter<Ratio>,
    is_powered: bool,
    powered_by: ElectricalBusType,
    valve_type: HydraulicValveType,

    pressure_input: Pressure,
    pressure_output: Pressure,
}
impl HydraulicValve {
    const POSITION_RESPONSE_TIME_CONSTANT: Duration = Duration::from_millis(150);
    const MIN_POSITION_FOR_ZERO_PRESSURE_RATIO: f64 = 0.02;

    fn new(valve_type: HydraulicValveType, powered_by: ElectricalBusType) -> Self {
        Self {
            position: LowPassFilter::<Ratio>::new(Self::POSITION_RESPONSE_TIME_CONSTANT),
            is_powered: false, // TODO set to false and add SimulationElement powering
            powered_by,
            valve_type,
            pressure_input: Pressure::default(),
            pressure_output: Pressure::default(),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        commanded_open: bool,
        current_pressure_input: Pressure,
    ) {
        let commanded_position = self.actual_target_position_from_valve_type(commanded_open);

        self.position.update(context.delta(), commanded_position);

        self.pressure_input = current_pressure_input;
        self.update_output_pressure();
    }

    fn actual_target_position_from_valve_type(&self, commanded_open: bool) -> Ratio {
        match self.valve_type {
            HydraulicValveType::_OpenedWhenOff => {
                if !commanded_open && self.is_powered {
                    Ratio::new::<ratio>(0.)
                } else {
                    Ratio::new::<ratio>(1.)
                }
            }
            HydraulicValveType::ClosedWhenOff => {
                if commanded_open && self.is_powered {
                    Ratio::new::<ratio>(1.)
                } else {
                    Ratio::new::<ratio>(0.)
                }
            }
            HydraulicValveType::Mechanical => {
                if commanded_open {
                    Ratio::new::<ratio>(1.)
                } else {
                    Ratio::new::<ratio>(0.)
                }
            }
        }
    }

    fn update_output_pressure(&mut self) {
        self.pressure_output =
            if self.position.output().get::<ratio>() > Self::MIN_POSITION_FOR_ZERO_PRESSURE_RATIO {
                self.pressure_input
                    * (self.position.output().sqrt() * 1.4)
                        .min(Ratio::new::<ratio>(1.).max(Ratio::new::<ratio>(0.)))
            } else {
                Pressure::default()
            }
    }

    fn pressure_output(&self) -> Pressure {
        self.pressure_output
    }
}
impl SimulationElement for HydraulicValve {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by)
    }
}

struct DirectionalValve {
    position: LowPassFilter<Ratio>,
    is_powered: bool,
    powered_by: ElectricalBusType,

    pressure_output: Pressure,
}
impl DirectionalValve {
    const POSITION_RESPONSE_TIME_CONSTANT: Duration = Duration::from_millis(150);

    fn new(powered_by: ElectricalBusType) -> Self {
        Self {
            position: LowPassFilter::<Ratio>::new(Self::POSITION_RESPONSE_TIME_CONSTANT),
            is_powered: true, // TODO set to false and add SimulationElement powering
            powered_by,
            pressure_output: Pressure::default(),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        commanded_retraction: bool,
        current_pressure_input: Pressure,
    ) {
        let commanded_position = if commanded_retraction || !self.is_powered {
            Ratio::new::<ratio>(-1.)
        } else {
            Ratio::new::<ratio>(1.)
        };

        self.position.update(context.delta(), commanded_position);

        self.pressure_output = current_pressure_input * self.position.output();
    }

    fn pressure_output(&self) -> Pressure {
        self.pressure_output
    }
}
impl SimulationElement for DirectionalValve {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by)
    }
}

pub trait ReverserInterface {
    fn should_unlock(&self) -> bool;
    fn should_power_valves(&self) -> bool;
    fn should_isolate_hydraulics(&self) -> bool;
    fn should_deploy_reverser(&self) -> bool;
}

pub trait ReverserFeedback {
    fn position_sensor(&self) -> Ratio;
    fn proximity_sensor_stowed(&self) -> bool;
    fn proximity_sensor_all_opened(&self) -> bool;
    fn pressure_switch_pressurised(&self) -> bool;
    fn tertiary_lock_is_locked(&self) -> bool;
}

struct ReverserHydraulicManifold {
    isolation_valve: HydraulicValve,
    directional_valve: DirectionalValve,

    pressure_switch: PressureSwitch,
}
impl ReverserHydraulicManifold {
    fn new(
        powered_by: ElectricalBusType,
        switch_high_pressure: Pressure,
        switch_low_pressure: Pressure,
    ) -> Self {
        Self {
            isolation_valve: HydraulicValve::new(HydraulicValveType::ClosedWhenOff, powered_by),
            directional_valve: DirectionalValve::new(powered_by),
            pressure_switch: PressureSwitch::new(
                switch_high_pressure,
                switch_low_pressure,
                PressureSwitchType::Absolute,
            ),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        pressure: Pressure,
        controller: &impl ReverserInterface,
    ) {
        self.isolation_valve.update(
            context,
            !controller.should_isolate_hydraulics() && controller.should_power_valves(),
            pressure,
        );

        self.pressure_switch
            .update(context, self.isolation_valve.pressure_output());

        self.directional_valve.update(
            context,
            !controller.should_deploy_reverser() || !controller.should_power_valves(),
            self.isolation_valve.pressure_output(),
        )
    }

    fn manifold_pressure(&self) -> Pressure {
        self.isolation_valve.pressure_output()
    }

    fn actuator_pressure(&self) -> Pressure {
        self.directional_valve.pressure_output()
    }

    fn pressure_switch_pressurised(&self) -> bool {
        self.pressure_switch.state() == PressureSwitchState::Pressurised
    }
}
impl SimulationElement for ReverserHydraulicManifold {
    fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
        self.isolation_valve.accept(visitor);
        self.directional_valve.accept(visitor);

        visitor.visit(self);
    }
}

pub struct ReverserAssembly {
    electrical_lock: ElectricalLock,
    hydraulic_manifold: ReverserHydraulicManifold,
    actuator: ReverserActuator,
}
impl ReverserAssembly {
    pub fn new(
        nominal_hydraulic_pressure: Pressure,
        switch_high_threshold_pressure: Pressure,
        switch_low_threshold_pressure: Pressure,
        electrical_lock_powered_by: ElectricalBusType,
        hyd_valves_powered_by: ElectricalBusType,
    ) -> Self {
        Self {
            electrical_lock: ElectricalLock::new(electrical_lock_powered_by),
            hydraulic_manifold: ReverserHydraulicManifold::new(
                hyd_valves_powered_by,
                switch_high_threshold_pressure,
                switch_low_threshold_pressure,
            ),
            actuator: ReverserActuator::new(nominal_hydraulic_pressure),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        controller: &impl ReverserInterface,
        pressure: Pressure,
    ) {
        self.electrical_lock
            .update(controller, self.reverser_position());

        self.hydraulic_manifold
            .update(context, pressure, controller);

        self.actuator.update(
            context,
            self.hydraulic_manifold.actuator_pressure(),
            self.electrical_lock.is_locked(),
        );
    }

    pub fn reverser_position(&self) -> Ratio {
        self.actuator.position()
    }
}
impl ReverserFeedback for ReverserAssembly {
    fn position_sensor(&self) -> Ratio {
        self.reverser_position()
    }

    fn proximity_sensor_stowed(&self) -> bool {
        self.reverser_position().get::<ratio>() < 0.05
    }

    fn proximity_sensor_all_opened(&self) -> bool {
        self.reverser_position().get::<ratio>() > 0.99
    }

    fn pressure_switch_pressurised(&self) -> bool {
        self.hydraulic_manifold.pressure_switch_pressurised()
    }

    fn tertiary_lock_is_locked(&self) -> bool {
        self.electrical_lock.is_locked()
    }
}
impl SimulationElement for ReverserAssembly {
    fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
        self.electrical_lock.accept(visitor);
        self.hydraulic_manifold.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use uom::si::{angle::degree, electric_potential::volt, volume_rate::gallon_per_minute};

    use crate::electrical::test::TestElectricitySource;
    use crate::electrical::ElectricalBus;
    use crate::electrical::Electricity;

    use super::*;
    use crate::shared::{update_iterator::FixedStepLoop, PotentialOrigin};
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed};
    use crate::simulation::{Aircraft, SimulationElement};
    use ntest::assert_about_eq;
    use std::time::Duration;

    struct TestReverserController {
        should_lock: bool,
        should_isolate_hydraulics: bool,
        should_deploy_reversers: bool,
    }
    impl TestReverserController {
        fn default() -> Self {
            Self {
                should_lock: true,
                should_isolate_hydraulics: true,
                should_deploy_reversers: false,
            }
        }

        fn set_isolation_valve(&mut self, is_closed: bool) {
            self.should_isolate_hydraulics = is_closed;
        }

        fn set_deploy_reverser(&mut self, is_deploying: bool) {
            self.should_deploy_reversers = is_deploying;
        }

        fn set_lock_reverser(&mut self, lock: bool) {
            self.should_lock = lock;
        }
    }
    impl ReverserInterface for TestReverserController {
        fn should_unlock(&self) -> bool {
            !self.should_lock
        }

        fn should_isolate_hydraulics(&self) -> bool {
            self.should_isolate_hydraulics
        }

        fn should_deploy_reverser(&self) -> bool {
            self.should_deploy_reversers
        }
    }

    struct TestAircraft {
        updater_fixed_step: FixedStepLoop,

        controller: TestReverserController,

        reverser: ReverserAssembly,

        hydraulic_pressure: Pressure,

        powered_source_ac: TestElectricitySource,
        dc_ess_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        ac_ess_bus: ElectricalBus,
        ac_2_bus: ElectricalBus,
        is_dc_elec_powered: bool,
        is_ac_elec_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                updater_fixed_step: FixedStepLoop::new(Duration::from_millis(10)),
                controller: TestReverserController::default(),

                reverser: ReverserAssembly::new(
                    Pressure::new::<psi>(3000.),
                    Pressure::new::<psi>(2100.),
                    Pressure::new::<psi>(1750.),
                    ElectricalBusType::AlternatingCurrent(2),
                    ElectricalBusType::DirectCurrent(2),
                ),

                hydraulic_pressure: Pressure::default(),

                powered_source_ac: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),

                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                ac_ess_bus: ElectricalBus::new(
                    context,
                    ElectricalBusType::AlternatingCurrentEssential,
                ),
                ac_2_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),

                is_dc_elec_powered: true,
                is_ac_elec_powered: true,
            }
        }

        fn reverser_position(&self) -> Ratio {
            self.reverser.reverser_position()
        }

        fn reverser_manifold_pressure(&self) -> Pressure {
            self.reverser.hydraulic_manifold.manifold_pressure()
        }

        fn reverser_is_locked(&self) -> bool {
            self.reverser.electrical_lock.is_locked()
        }

        fn set_hyd_pressure(&mut self, pressure: Pressure) {
            self.hydraulic_pressure = pressure;
        }

        fn set_ac_elec_power(&mut self, is_on: bool) {
            self.is_ac_elec_powered = is_on;
        }

        fn set_dc_elec_power(&mut self, is_on: bool) {
            self.is_dc_elec_powered = is_on;
        }

        fn set_isolation_valve(&mut self, is_closed: bool) {
            self.controller.set_isolation_valve(is_closed)
        }

        fn set_deploy_reverser(&mut self, is_deploying: bool) {
            self.controller.set_deploy_reverser(is_deploying)
        }

        fn set_lock_reverser(&mut self, lock: bool) {
            self.controller.set_lock_reverser(lock)
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.powered_source_ac
                .power_with_potential(ElectricPotential::new::<volt>(140.));
            electricity.supplied_by(&self.powered_source_ac);

            if self.is_dc_elec_powered {
                electricity.flow(&self.powered_source_ac, &self.dc_2_bus);
                electricity.flow(&self.powered_source_ac, &self.dc_ess_bus);
            }

            if self.is_ac_elec_powered {
                electricity.flow(&self.powered_source_ac, &self.ac_ess_bus);
                electricity.flow(&self.powered_source_ac, &self.ac_2_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.updater_fixed_step.update(context);

            for cur_time_step in &mut self.updater_fixed_step {
                self.reverser.update(
                    &context.with_delta(cur_time_step),
                    &self.controller,
                    self.hydraulic_pressure,
                );

                println!(
                    "Reverser Pos: {:.3} ,Hyds Input/Manifold/Actuator {:.0}/{:.0}/{:.0}",
                    self.reverser.actuator.position().get::<ratio>(),
                    self.hydraulic_pressure.get::<psi>(),
                    self.reverser
                        .hydraulic_manifold
                        .manifold_pressure()
                        .get::<psi>(),
                    self.reverser
                        .hydraulic_manifold
                        .directional_valve
                        .pressure_output()
                        .get::<psi>(),
                );
            }
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.reverser.accept(visitor);

            visitor.visit(self);
        }
    }

    #[test]
    fn reverser_stowed_at_init() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_ac_elec_power(false));
        test_bed.command(|a| a.set_dc_elec_power(false));
        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) == 0.);
    }

    #[test]
    fn reverser_without_pressure_if_isolated() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) <= 50.);
        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= -50.);
    }

    #[test]
    fn reverser_isolated_if_no_valve_power() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(false));
        test_bed.command(|a| a.set_dc_elec_power(false));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) <= 50.);
        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= -50.);
    }

    #[test]
    fn reverser_pressurised_if_valve_powered_and_opened() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(true));
        test_bed.command(|a| a.set_dc_elec_power(true));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= 2800.);
    }

    #[test]
    fn reverser_do_not_deploy_if_locked() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(true));
        test_bed.command(|a| a.set_dc_elec_power(true));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.command(|a| a.set_deploy_reverser(true));
        test_bed.command(|a| a.set_lock_reverser(true));

        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= 2800.);
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) == 0.);
    }

    #[test]
    fn reverser_do_not_deploy_if_unlocked_but_no_lock_power() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(false));
        test_bed.command(|a| a.set_dc_elec_power(true));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.command(|a| a.set_deploy_reverser(true));
        test_bed.command(|a| a.set_lock_reverser(false));

        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= 2800.);
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) == 0.);
    }

    #[test]
    fn reverser_deploys_if_unlocked_and_lock_powered() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(true));
        test_bed.command(|a| a.set_dc_elec_power(true));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.command(|a| a.set_deploy_reverser(true));
        test_bed.command(|a| a.set_lock_reverser(false));

        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(test_bed.query(|a| a.reverser_manifold_pressure().get::<psi>()) >= 2800.);
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) >= 0.3);

        test_bed.run_with_delta(Duration::from_millis(1500));

        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) >= 0.99);
    }

    #[test]
    fn reverser_deploys_and_can_be_stowed_back() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.command(|a| a.set_hyd_pressure(Pressure::new::<psi>(3000.)));
        test_bed.command(|a| a.set_ac_elec_power(true));
        test_bed.command(|a| a.set_dc_elec_power(true));
        test_bed.command(|a| a.set_isolation_valve(false));
        test_bed.command(|a| a.set_deploy_reverser(true));
        test_bed.command(|a| a.set_lock_reverser(false));

        test_bed.run_with_delta(Duration::from_millis(2500));
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) >= 0.99);

        test_bed.command(|a| a.set_lock_reverser(true));
        test_bed.command(|a| a.set_deploy_reverser(false));

        test_bed.run_with_delta(Duration::from_millis(1000));
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) <= 0.9);
        assert!(test_bed.query(|a| !a.reverser_is_locked()));

        test_bed.run_with_delta(Duration::from_millis(2000));
        assert!(test_bed.query(|a| a.reverser_position().get::<ratio>()) <= 0.01);
        assert!(test_bed.query(|a| a.reverser_is_locked()));
    }
}
