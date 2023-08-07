// Note: Fuel system for now is still handled in MSFS. This is used for calculating fuel-related factors.

use nalgebra::Vector3;
use systems::{
    fuel::{FuelInfo, FuelSystem, FuelTank},
    simulation::{InitContext, SimulationElement, SimulationElementVisitor},
};
use uom::si::f64::*;

#[cfg(test)]
pub mod test;

pub trait FuelLevel {
    fn left_inner_tank_has_fuel(&self) -> bool;
    fn right_inner_tank_has_fuel(&self) -> bool;
    fn left_outer_tank_has_fuel(&self) -> bool;
    fn right_outer_tank_has_fuel(&self) -> bool;
    fn center_tank_has_fuel(&self) -> bool;
}
impl FuelLevel for A320Fuel {
    fn left_inner_tank_has_fuel(&self) -> bool {
        self.left_inner_tank_has_fuel()
    }
    fn right_inner_tank_has_fuel(&self) -> bool {
        self.right_inner_tank_has_fuel()
    }
    fn left_outer_tank_has_fuel(&self) -> bool {
        self.left_outer_tank_has_fuel()
    }
    fn right_outer_tank_has_fuel(&self) -> bool {
        self.right_outer_tank_has_fuel()
    }
    fn center_tank_has_fuel(&self) -> bool {
        self.center_tank_has_fuel()
    }
}

pub trait FuelPayload {
    fn total_load(&self) -> Mass;
    fn fore_aft_center_of_gravity(&self) -> f64;
}
impl FuelPayload for A320Fuel {
    fn total_load(&self) -> Mass {
        self.total_load()
    }
    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.fore_aft_center_of_gravity()
    }
}

pub trait FuelCG {
    fn center_of_gravity(&self) -> Vector3<f64>;
}
impl FuelCG for A320Fuel {
    fn center_of_gravity(&self) -> Vector3<f64> {
        self.center_of_gravity()
    }
}

pub enum A320FuelTankType {
    Center,
    LeftInner,
    LeftOuter,
    RightInner,
    RightOuter,
}

pub struct A320Fuel {
    fuel_system: FuelSystem,
}
impl A320Fuel {
    pub const A320_FUEL: [FuelInfo<'_>; 5] = [
        FuelInfo {
            fuel_tank_id: "FUEL TANK CENTER QUANTITY",
            position: (-4.5, 0., 1.),
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK LEFT MAIN QUANTITY",
            position: (-8., -13., 2.),
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK LEFT AUX QUANTITY",
            position: (-16.9, -27., 3.),
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK RIGHT MAIN QUANTITY",
            position: (-8., 13., 2.),
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK RIGHT AUX QUANTITY",
            position: (-16.9, 27., 3.),
        },
    ];

    pub fn new(context: &mut InitContext) -> Self {
        let fuel_tanks: Vec<FuelTank> = Self::A320_FUEL
            .iter()
            .map(|f| {
                FuelTank::new(
                    context.get_identifier(f.fuel_tank_id.to_owned()),
                    Vector3::new(f.position.0, f.position.1, f.position.2),
                )
            })
            .collect::<Vec<FuelTank>>()
            .try_into()
            .unwrap();
        A320Fuel {
            fuel_system: FuelSystem::new(context, fuel_tanks),
        }
    }

    pub fn left_inner_tank_has_fuel_remaining(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftInner as usize)
    }

    fn center_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::Center as usize)
    }

    fn left_inner_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftInner as usize)
    }

    fn left_outer_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftOuter as usize)
    }

    fn right_inner_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::RightInner as usize)
    }

    fn right_outer_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::RightOuter as usize)
    }

    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.center_of_gravity().x
    }

    fn total_load(&self) -> Mass {
        self.fuel_system.total_load()
    }

    fn center_of_gravity(&self) -> Vector3<f64> {
        self.fuel_system.center_of_gravity()
    }
}
impl SimulationElement for A320Fuel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fuel_system.accept(visitor);
        visitor.visit(self);
    }
}
