// Copyright (c) 2023 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <MSFS/Legacy/gauges.h>
#include <iostream>

#include "LightingPresets_A380X.h"
#include "logging.h"

///
// DataManager Howto Note:
// =======================

// The LightingPresets_A32NX module uses the DataManager to get and set variables.
// Looking at the make_xxx_var functions, you can see that they are updated
// with different update cycles.
//
// Some variables are read from the sim at every tick:
// - A32NX_ELEC_AC_1_BUS_IS_POWERED
//
// Some variables are read and written from/to the sim at every tick:
// - A32NX_LIGHTING_PRESET_LOAD
// - A32NX_LIGHTING_PRESET_SAVE
//
// The rest are read on demand after the state of the above variables have been checked.
//
// This makes sure variables are only read or written to when really needed. And as
// LightingPresets_A32NX will be dormant most of the time, this is saving a lot of
// unnecessary reads/writes.
///

bool LightingPresets_A380X::initialize() {
  dataManager = &msfsHandler.getDataManager();

  // Events for setting the aircraft variables
  lightPotentiometerSetEvent = dataManager->make_client_event("LIGHT_POTENTIOMETER_SET", NOTIFICATION_GROUP_1);
  cabinLightSetEvent = dataManager->make_client_event("CABIN_LIGHTS_SET", NOTIFICATION_GROUP_1);

  // Control LVARs - auto updated with every tick - LOAD/SAVE also auto written to sim
  elecAC1Powered = dataManager->make_named_var("ELEC_AC_1_BUS_IS_POWERED", UNITS.Number, true, false);
  loadLightingPresetRequest = dataManager->make_named_var("LIGHTING_PRESET_LOAD", UNITS.Number, true, true);
  saveLightingPresetRequest = dataManager->make_named_var("LIGHTING_PRESET_SAVE", UNITS.Number, true, true);

  // Lighting LVARs - manual update and write when load/saving is requested
  efbBrightness = dataManager->make_named_var("EFB_BRIGHTNESS", UNITS.Number, false, false);
  dcduLeftLightLevel = dataManager->make_named_var("PANEL_DCDU_L_BRIGHTNESS", UNITS.Number, false, false);
  dcduRightLightLevel = dataManager->make_named_var("PANEL_DCDU_R_BRIGHTNESS", UNITS.Number, false, false);
  mcduLeftLightLevel = dataManager->make_named_var("MCDU_L_BRIGHTNESS", UNITS.Number, false, false);
  mcduRightLightLevel = dataManager->make_named_var("MCDU_R_BRIGHTNESS", UNITS.Number, false, false);

  // Light Potentiometers - manual update and write when load/saving is requested
  lightCabin = dataManager->make_aircraft_var("LIGHT CABIN", 0, "", cabinLightSetEvent, UNITS.Percent);
  lightCabinLevel = getLightPotentiometerVar(7);
  ovhdIntegralLightLevel = getLightPotentiometerVar(86);
  glareshieldIntegralLightLevel = getLightPotentiometerVar(84);
  glareshieldLcdLightLevel = getLightPotentiometerVar(87);
  tableLightCptLevel = getLightPotentiometerVar(10);
  tableLightFoLevel = getLightPotentiometerVar(11);
  pfdBrtCptLevel = getLightPotentiometerVar(88);
  ndBrtCptLevel = getLightPotentiometerVar(89);
  wxTerrainBrtCptLevel = getLightPotentiometerVar(94);
  consoleLightCptLevel = getLightPotentiometerVar(8);
  pfdBrtFoLevel = getLightPotentiometerVar(90);
  ndBrtFoLevel = getLightPotentiometerVar(91);
  wxTerrainBrtFoLevel = getLightPotentiometerVar(95);
  consoleLightFoLevel = getLightPotentiometerVar(9);
  ecamUpperLightLevel = getLightPotentiometerVar(92);
  ecamLowerLightLevel = getLightPotentiometerVar(93);
  floodPnlLightLevel = getLightPotentiometerVar(83);
  pedestalIntegralLightLevel = getLightPotentiometerVar(85);
  floodPedLightLevel = getLightPotentiometerVar(76);

  loadLightingPresetRequest->setAsInt64(0);
  saveLightingPresetRequest->setAsInt64(0);

  _isInitialized = true;
  LOG_INFO("LightingPresets_A380X initialized");
  return true;
}

// =================================================================================================
// PRIVATE METHODS
// =================================================================================================

void LightingPresets_A380X::readFromAircraft() {
  currentLightValues.efbBrightness = efbBrightness->readFromSim();
  currentLightValues.cabinLightLevel = lightCabinLevel->readFromSim();
  currentLightValues.ovhdIntegralLightLevel = ovhdIntegralLightLevel->readFromSim();
  currentLightValues.glareshieldIntegralLightLevel = glareshieldIntegralLightLevel->readFromSim();
  currentLightValues.glareshieldLcdLightLevel = glareshieldLcdLightLevel->readFromSim();
  currentLightValues.tableLightCptLevel = tableLightCptLevel->readFromSim();
  currentLightValues.tableLightFoLevel = tableLightFoLevel->readFromSim();
  currentLightValues.pfdBrtCptLevel = pfdBrtCptLevel->readFromSim();
  currentLightValues.ndBrtCptLevel = ndBrtCptLevel->readFromSim();
  currentLightValues.wxTerrainBrtCptLevel = wxTerrainBrtCptLevel->readFromSim();
  currentLightValues.consoleLightCptLevel = consoleLightCptLevel->readFromSim();
  currentLightValues.pfdBrtFoLevel = pfdBrtFoLevel->readFromSim();
  currentLightValues.ndBrtFoLevel = ndBrtFoLevel->readFromSim();
  currentLightValues.wxTerrainBrtFoLevel = wxTerrainBrtFoLevel->readFromSim();
  currentLightValues.consoleLightFoLevel = consoleLightFoLevel->readFromSim();
  currentLightValues.dcduLeftLightLevel = dcduLeftLightLevel->readFromSim();
  currentLightValues.dcduRightLightLevel = dcduLeftLightLevel->readFromSim();
  currentLightValues.mcduLeftLightLevel = mcduLeftLightLevel->readFromSim();
  currentLightValues.mcduRightLightLevel = mcduRightLightLevel->readFromSim();
  currentLightValues.ecamUpperLightLevel = ecamUpperLightLevel->readFromSim();
  currentLightValues.ecamLowerLightLevel = ecamLowerLightLevel->readFromSim();
  currentLightValues.floodPnlLightLevel = floodPnlLightLevel->readFromSim();
  currentLightValues.pedestalIntegralLightLevel = pedestalIntegralLightLevel->readFromSim();
  currentLightValues.floodPedLightLevel = floodPedLightLevel->readFromSim();
}

void LightingPresets_A380X::applyToAircraft() {
  efbBrightness->setAndWriteToSim(intermediateLightValues.efbBrightness);
  setValidCabinLightValue(intermediateLightValues.cabinLightLevel);
  ovhdIntegralLightLevel->setAndWriteToSim(intermediateLightValues.ovhdIntegralLightLevel);
  glareshieldIntegralLightLevel->setAndWriteToSim(intermediateLightValues.glareshieldIntegralLightLevel);
  glareshieldLcdLightLevel->setAndWriteToSim(intermediateLightValues.glareshieldLcdLightLevel);
  tableLightCptLevel->setAndWriteToSim(intermediateLightValues.tableLightCptLevel);
  tableLightFoLevel->setAndWriteToSim(intermediateLightValues.tableLightFoLevel);
  pfdBrtCptLevel->setAndWriteToSim(intermediateLightValues.pfdBrtCptLevel);
  ndBrtCptLevel->setAndWriteToSim(intermediateLightValues.ndBrtCptLevel);
  wxTerrainBrtCptLevel->setAndWriteToSim(intermediateLightValues.wxTerrainBrtCptLevel);
  consoleLightCptLevel->setAndWriteToSim(intermediateLightValues.consoleLightCptLevel);
  pfdBrtFoLevel->setAndWriteToSim(intermediateLightValues.pfdBrtFoLevel);
  ndBrtFoLevel->setAndWriteToSim(intermediateLightValues.ndBrtFoLevel);
  wxTerrainBrtFoLevel->setAndWriteToSim(intermediateLightValues.wxTerrainBrtFoLevel);
  consoleLightFoLevel->setAndWriteToSim(intermediateLightValues.consoleLightFoLevel);
  dcduLeftLightLevel->setAndWriteToSim(intermediateLightValues.dcduLeftLightLevel);
  dcduRightLightLevel->setAndWriteToSim(intermediateLightValues.dcduRightLightLevel);
  mcduLeftLightLevel->setAndWriteToSim(intermediateLightValues.mcduLeftLightLevel);
  mcduRightLightLevel->setAndWriteToSim(intermediateLightValues.mcduRightLightLevel);
  ecamUpperLightLevel->setAndWriteToSim(intermediateLightValues.ecamUpperLightLevel);
  ecamLowerLightLevel->setAndWriteToSim(intermediateLightValues.ecamLowerLightLevel);
  floodPnlLightLevel->setAndWriteToSim(intermediateLightValues.floodPnlLightLevel);
  pedestalIntegralLightLevel->setAndWriteToSim(intermediateLightValues.pedestalIntegralLightLevel);
  floodPedLightLevel->setAndWriteToSim(intermediateLightValues.floodPedLightLevel);
}

void LightingPresets_A380X::loadFromIni(const mINI::INIStructure& ini,
                                          const std::string& iniSectionName) {
  // check if iniSectionName is available
  // if not use a 50% default iniSectionName
  if (!ini.has(iniSectionName)) {
    intermediateLightValues = DEFAULT_50;
    return;
  }

  // reading data structure from ini
  loadedLightValues.efbBrightness = iniGetOrDefault(ini, iniSectionName, "efb_brightness", 80.0);
  loadedLightValues.cabinLightLevel = iniGetOrDefault(ini, iniSectionName, "cabin_light", 50.0);
  loadedLightValues.ovhdIntegralLightLevel = iniGetOrDefault(ini, iniSectionName, "ovhd_int_lt", 50.0);
  loadedLightValues.glareshieldIntegralLightLevel = iniGetOrDefault(ini, iniSectionName, "glareshield_int_lt", 50.0);
  loadedLightValues.glareshieldLcdLightLevel = iniGetOrDefault(ini, iniSectionName, "glareshield_lcd_lt", 50.0);
  loadedLightValues.tableLightCptLevel = iniGetOrDefault(ini, iniSectionName, "table_cpt_lt", 50.0);
  loadedLightValues.tableLightFoLevel = iniGetOrDefault(ini, iniSectionName, "table_fo_lt", 50.0);
  loadedLightValues.pfdBrtCptLevel = iniGetOrDefault(ini, iniSectionName, "pfd_cpt_lvl", 50.0);
  loadedLightValues.ndBrtCptLevel = iniGetOrDefault(ini, iniSectionName, "nd_cpt_lvl", 50.0);
  loadedLightValues.wxTerrainBrtCptLevel = iniGetOrDefault(ini, iniSectionName, "wx_cpt_lvl", 50.0);
  loadedLightValues.consoleLightCptLevel = iniGetOrDefault(ini, iniSectionName, "console_cpt_lt", 50.0);
  loadedLightValues.pfdBrtFoLevel = iniGetOrDefault(ini, iniSectionName, "pfd_fo_lvl", 50.0);
  loadedLightValues.ndBrtFoLevel = iniGetOrDefault(ini, iniSectionName, "nd_fo_lvl", 50.0);
  loadedLightValues.wxTerrainBrtFoLevel = iniGetOrDefault(ini, iniSectionName, "wx_fo_lvl", 50.0);
  loadedLightValues.consoleLightFoLevel = iniGetOrDefault(ini, iniSectionName, "console_fo_lt", 50.0);
  loadedLightValues.dcduLeftLightLevel = iniGetOrDefault(ini, iniSectionName, "dcdu_left_lvl", 50.0) / 100;
  loadedLightValues.dcduRightLightLevel = iniGetOrDefault(ini, iniSectionName, "dcdu_right_lvl", 50.0) / 100;
  loadedLightValues.mcduLeftLightLevel = iniGetOrDefault(ini, iniSectionName, "mcdu_left_lvl", 50.0) / 100;
  loadedLightValues.mcduRightLightLevel = iniGetOrDefault(ini, iniSectionName, "mcdu_right_lvl", 50.0) / 100;
  loadedLightValues.ecamUpperLightLevel = iniGetOrDefault(ini, iniSectionName, "ecam_upper_lvl", 50.0);
  loadedLightValues.ecamLowerLightLevel = iniGetOrDefault(ini, iniSectionName, "ecam_lower_lvl", 50.0);
  loadedLightValues.floodPnlLightLevel = iniGetOrDefault(ini, iniSectionName, "flood_pnl_lt", 50.0);
  loadedLightValues.pedestalIntegralLightLevel = iniGetOrDefault(ini, iniSectionName, "pedestal_int_lt", 50.0);
  loadedLightValues.floodPedLightLevel = iniGetOrDefault(ini, iniSectionName, "flood_ped_lvl", 50.0);
}

void LightingPresets_A380X::saveToIni(mINI::INIStructure& ini, const std::string& iniSectionName) const {
  ini[iniSectionName]["efb_brightness"] = std::to_string(currentLightValues.efbBrightness);
  ini[iniSectionName]["cabin_light"] = std::to_string(currentLightValues.cabinLightLevel);
  ini[iniSectionName]["ovhd_int_lt"] = std::to_string(currentLightValues.ovhdIntegralLightLevel);
  ini[iniSectionName]["glareshield_int_lt"] = std::to_string(currentLightValues.glareshieldIntegralLightLevel);
  ini[iniSectionName]["glareshield_lcd_lt"] = std::to_string(currentLightValues.glareshieldLcdLightLevel);
  ini[iniSectionName]["table_cpt_lt"] = std::to_string(currentLightValues.tableLightCptLevel);
  ini[iniSectionName]["table_fo_lt"] = std::to_string(currentLightValues.tableLightFoLevel);
  ini[iniSectionName]["pfd_cpt_lvl"] = std::to_string(currentLightValues.pfdBrtCptLevel);
  ini[iniSectionName]["nd_cpt_lvl"] = std::to_string(currentLightValues.ndBrtCptLevel);
  ini[iniSectionName]["wx_cpt_lvl"] = std::to_string(currentLightValues.wxTerrainBrtCptLevel);
  ini[iniSectionName]["console_cpt_lt"] = std::to_string(currentLightValues.consoleLightCptLevel);
  ini[iniSectionName]["pfd_fo_lvl"] = std::to_string(currentLightValues.pfdBrtFoLevel);
  ini[iniSectionName]["nd_fo_lvl"] = std::to_string(currentLightValues.ndBrtFoLevel);
  ini[iniSectionName]["wx_fo_lvl"] = std::to_string(currentLightValues.wxTerrainBrtFoLevel);
  ini[iniSectionName]["console_fo_lt"] = std::to_string(currentLightValues.consoleLightFoLevel);
  ini[iniSectionName]["dcdu_left_lvl"] = std::to_string(currentLightValues.dcduLeftLightLevel * 100);
  ini[iniSectionName]["dcdu_right_lvl"] = std::to_string(currentLightValues.dcduRightLightLevel * 100);
  ini[iniSectionName]["mcdu_left_lvl"] = std::to_string(currentLightValues.mcduLeftLightLevel * 100);
  ini[iniSectionName]["mcdu_right_lvl"] = std::to_string(currentLightValues.mcduRightLightLevel * 100);
  ini[iniSectionName]["ecam_upper_lvl"] = std::to_string(currentLightValues.ecamUpperLightLevel);
  ini[iniSectionName]["ecam_lower_lvl"] = std::to_string(currentLightValues.ecamLowerLightLevel);
  ini[iniSectionName]["flood_pnl_lt"] = std::to_string(currentLightValues.floodPnlLightLevel);
  ini[iniSectionName]["pedestal_int_lt"] = std::to_string(currentLightValues.pedestalIntegralLightLevel);
  ini[iniSectionName]["flood_ped_lvl"] = std::to_string(currentLightValues.floodPedLightLevel);
}

[[maybe_unused]] std::string LightingPresets_A380X::str() const {
  std::ostringstream os;
  os << "EFB Brightness: " << intermediateLightValues.efbBrightness << std::endl;
  os << "Cabin Light: " << intermediateLightValues.cabinLightLevel << std::endl;
  os << "Ovhd Int Lt: " << intermediateLightValues.ovhdIntegralLightLevel << std::endl;
  os << "Glareshield Int Lt: " << intermediateLightValues.glareshieldIntegralLightLevel << std::endl;
  os << "Glareshield Lcd Lt: " << intermediateLightValues.glareshieldLcdLightLevel << std::endl;
  os << "Table Cpt Lt: " << intermediateLightValues.tableLightCptLevel << std::endl;
  os << "Table FO Lt: " << intermediateLightValues.tableLightFoLevel << std::endl;
  os << "PFD Cpt Lvl: " << intermediateLightValues.pfdBrtCptLevel << std::endl;
  os << "ND Cpt Lvl: " << intermediateLightValues.ndBrtCptLevel << std::endl;
  os << "WX Cpt Lvl: " << intermediateLightValues.wxTerrainBrtCptLevel << std::endl;
  os << "Console Cpt Lt: " << intermediateLightValues.consoleLightCptLevel << std::endl;
  os << "PFD FO Lvl: " << intermediateLightValues.pfdBrtFoLevel << std::endl;
  os << "ND FO Lvl: " << intermediateLightValues.ndBrtFoLevel << std::endl;
  os << "WX FO Lvl: " << intermediateLightValues.wxTerrainBrtFoLevel << std::endl;
  os << "Console Fo Lt: " << intermediateLightValues.consoleLightFoLevel << std::endl;
  os << "DCDU Left Lvl: " << intermediateLightValues.dcduLeftLightLevel << std::endl;
  os << "DCDU Right Lvl: " << intermediateLightValues.dcduRightLightLevel << std::endl;
  os << "MCDU Left Lvl: " << intermediateLightValues.mcduLeftLightLevel << std::endl;
  os << "MCDU Right Lvl: " << intermediateLightValues.mcduRightLightLevel << std::endl;
  os << "ECAM Upper Lvl: " << intermediateLightValues.ecamUpperLightLevel << std::endl;
  os << "ECAM Lower Lvl: " << intermediateLightValues.ecamLowerLightLevel << std::endl;
  os << "Floor Cpt Lt: " << intermediateLightValues.floodPnlLightLevel << std::endl;
  os << "Pedestal Int Lt: " << intermediateLightValues.pedestalIntegralLightLevel << std::endl;
  os << "Floor FO Lvl: " << intermediateLightValues.floodPedLightLevel << std::endl;
  return os.str();
}

void LightingPresets_A380X::setValidCabinLightValue(FLOAT64 level) {
  // cabin light level needs to either be 0, 50 or 100 for the switch position
  // in the aircraft to work.
  if (level <= 0.0) {
    level = 0.0;
  } else if (level > 0.0 && level <= 50.0) {
    level = 50.0;
  } else if ((level > 0.0 && level > 50.0)) {
    level = 100.0;
  }
  // cabin lights in the A32NX need to be controlled by two vars
  // one for the switch position and one for the actual light
  lightCabinLevel->setAndWriteToSim(level);
  lightCabin->setAndWriteToSim(level > 0 ? 1 : 0);
}

bool LightingPresets_A380X::calculateIntermediateValues() {
  // clang-format off
  intermediateLightValues.efbBrightness = convergeValue(loadedLightValues.efbBrightness, currentLightValues.efbBrightness);
  intermediateLightValues.cabinLightLevel = loadedLightValues.cabinLightLevel;
  intermediateLightValues.ovhdIntegralLightLevel = convergeValue(loadedLightValues.ovhdIntegralLightLevel, currentLightValues.ovhdIntegralLightLevel);
  intermediateLightValues.glareshieldIntegralLightLevel = convergeValue(loadedLightValues.glareshieldIntegralLightLevel, currentLightValues.glareshieldIntegralLightLevel);
  intermediateLightValues.glareshieldLcdLightLevel = convergeValue(loadedLightValues.glareshieldLcdLightLevel, currentLightValues.glareshieldLcdLightLevel);
  intermediateLightValues.tableLightCptLevel = convergeValue(loadedLightValues.tableLightCptLevel, currentLightValues.tableLightCptLevel);
  intermediateLightValues.tableLightFoLevel = convergeValue(loadedLightValues.tableLightFoLevel, currentLightValues.tableLightFoLevel);
  intermediateLightValues.pfdBrtCptLevel = convergeValue(loadedLightValues.pfdBrtCptLevel, currentLightValues.pfdBrtCptLevel);
  intermediateLightValues.ndBrtCptLevel = convergeValue(loadedLightValues.ndBrtCptLevel, currentLightValues.ndBrtCptLevel);
  intermediateLightValues.wxTerrainBrtCptLevel = convergeValue(loadedLightValues.wxTerrainBrtCptLevel, currentLightValues.wxTerrainBrtCptLevel);
  intermediateLightValues.consoleLightCptLevel = convergeValue(loadedLightValues.consoleLightCptLevel, currentLightValues.consoleLightCptLevel);
  intermediateLightValues.pfdBrtFoLevel = convergeValue(loadedLightValues.pfdBrtFoLevel, currentLightValues.pfdBrtFoLevel);
  intermediateLightValues.ndBrtFoLevel = convergeValue(loadedLightValues.ndBrtFoLevel, currentLightValues.ndBrtFoLevel);
  intermediateLightValues.wxTerrainBrtFoLevel = convergeValue(loadedLightValues.wxTerrainBrtFoLevel, currentLightValues.wxTerrainBrtFoLevel);
  intermediateLightValues.consoleLightFoLevel = convergeValue(loadedLightValues.consoleLightFoLevel, currentLightValues.consoleLightFoLevel);
  intermediateLightValues.dcduLeftLightLevel = convergeValue(loadedLightValues.dcduLeftLightLevel, currentLightValues.dcduLeftLightLevel);
  intermediateLightValues.dcduRightLightLevel = convergeValue(loadedLightValues.dcduRightLightLevel, currentLightValues.dcduRightLightLevel);
  intermediateLightValues.mcduLeftLightLevel = convergeValue(loadedLightValues.mcduLeftLightLevel, currentLightValues.mcduLeftLightLevel);
  intermediateLightValues.mcduRightLightLevel = convergeValue(loadedLightValues.mcduRightLightLevel, currentLightValues.mcduRightLightLevel);
  intermediateLightValues.ecamUpperLightLevel = convergeValue(loadedLightValues.ecamUpperLightLevel, currentLightValues.ecamUpperLightLevel);
  intermediateLightValues.ecamLowerLightLevel = convergeValue(loadedLightValues.ecamLowerLightLevel, currentLightValues.ecamLowerLightLevel);
  intermediateLightValues.floodPnlLightLevel = convergeValue(loadedLightValues.floodPnlLightLevel, currentLightValues.floodPnlLightLevel);
  intermediateLightValues.pedestalIntegralLightLevel = convergeValue(loadedLightValues.pedestalIntegralLightLevel, currentLightValues.pedestalIntegralLightLevel);
  intermediateLightValues.floodPedLightLevel = convergeValue(loadedLightValues.floodPedLightLevel, currentLightValues.floodPedLightLevel);
  // clang-format on
  return intermediateLightValues == loadedLightValues;
}