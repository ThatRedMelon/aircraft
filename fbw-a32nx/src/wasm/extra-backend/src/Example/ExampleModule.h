// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifdef EXAMPLES

#ifndef FLYBYWIRE_EXAMPLEMODULE_H
#define FLYBYWIRE_EXAMPLEMODULE_H

#include <array>
#include <chrono>

#include "DataManager.h"
#include "Module.h"

class MsfsHandler;

/**
 * This is an example  and test module which is used to demonstrate the usage of the module system
 * and to debug the module and DataManager system.
 * It has no effect on the simulation - it should never write to the sim other than in DEBUG mode
 * Should be commented out from the Gauge - remove -DEXAMPLES compiler flag.
 */
class ExampleModule : public Module {
 private:
  enum NotificationGroup { NOTIFICATION_GROUP_1 };

  enum InputGroup { INPUT_GROUP_1 };

  // Convenience pointer to the data manager
  DataManager* dataManager{};

  // LVARs
  NamedVariablePtr debugLVARPtr{};
  NamedVariablePtr debugLVAR2Ptr{};
  NamedVariablePtr debugLVAR3Ptr{};
  NamedVariablePtr debugLVAR4Ptr{};

  // Sim-vars
  AircraftVariablePtr beaconLightSwitchPtr;
  AircraftVariablePtr beaconLightSwitch2Ptr;
  AircraftVariablePtr beaconLightSwitch3Ptr;
  AircraftVariablePtr fuelPumpSwitch1Ptr;
  AircraftVariablePtr fuelPumpSwitch2Ptr;

  // DataDefinition variables
  struct ExampleData {
    [[maybe_unused]] FLOAT64 strobeLightSwitch;
    [[maybe_unused]] FLOAT64 wingLightSwitch;
    [[maybe_unused]] FLOAT64 zuluTime;      // E:ZULU TIME
    [[maybe_unused]] FLOAT64 localTime;     // E:LOCAL TIME
    [[maybe_unused]] FLOAT64 absoluteTime;  // E:ABSOLUTE TIME
    // if the string is longer than 256 characters, it will overwrite the subsequent variables
    // and the sim might crash. It seems to be ok when the string is last in the struct.
    // Then the string is truncated to the size but seem to have no other effect (due to the memcpy
    // being restricted to the size of the struct).
    [[maybe_unused]] char aircraftTTitle[256] = "";
  };
  std::shared_ptr<DataDefinitionVariable<ExampleData>> exampleDataPtr;

  // ClientDataArea variables
  struct ExampleClientData {
    [[maybe_unused]] FLOAT64 aFloat64;
    [[maybe_unused]] FLOAT32 aFloat32;
    [[maybe_unused]] INT64 anInt64;
    [[maybe_unused]] INT32 anInt32;
    [[maybe_unused]] INT16 anInt16;
    [[maybe_unused]] INT8 anInt8;
  } __attribute__((packed));
  std::shared_ptr<ClientDataAreaVariable<ExampleClientData>> exampleClientDataPtr;

  // Second ClientDataArea variable identical to the first one for testing
  struct ExampleClientData2 {
    [[maybe_unused]] INT8 anInt8;
    [[maybe_unused]] INT16 anInt16;
    [[maybe_unused]] INT32 anInt32;
    [[maybe_unused]] INT64 anInt64;
    [[maybe_unused]] FLOAT32 aFloat32;
    [[maybe_unused]] FLOAT64 aFloat64;
  } __attribute__((packed));
  std::shared_ptr<ClientDataAreaVariable<ExampleClientData2>> exampleClientData2Ptr;

  // ClientDataArea variable for testing
  struct BigClientData {
    std::array<BYTE, SIMCONNECT_CLIENTDATA_MAX_SIZE> dataChunk;
  } __attribute__((packed));
  std::shared_ptr<ClientDataAreaVariable<BigClientData>> bigClientDataPtr;

  // ClientDataArea variable for meta data for ClientDataBufferedAreaVariable
  struct BufferedAreaMetaData {
    UINT64 size;
    UINT64 hash;
  } __attribute__((packed));
  std::shared_ptr<ClientDataAreaVariable<BufferedAreaMetaData>> metaDataPtr;

  // ClientDataBufferedArea variable for testing
  std::shared_ptr<ClientDataBufferedAreaVariable<BYTE, SIMCONNECT_CLIENTDATA_MAX_SIZE>> hugeClientDataPtr;

  // Events
  ClientEventPtr beaconLightSetEventPtr;
  [[maybe_unused]] CallbackID beaconLightSetCallbackID{};
  ClientEventPtr lightPotentiometerSetEventPtr;
  [[maybe_unused]] CallbackID lightPotentiometerSetCallbackID{};
  ClientEventPtr lightPotentiometerSetEvent2Ptr;
  [[maybe_unused]] CallbackID lightPotentiometerSetCallback2ID{};

  // Input Events
  ClientEventPtr clientEventPtr;
  [[maybe_unused]] CallbackID clientEventCallbackId{};

  // System Events
  ClientEventPtr systemEventPtr;
  [[maybe_unused]] CallbackID systemEventCallbackId{};

 public:
  ExampleModule() = delete;

  /**
   * Creates a new ExampleModule instance and takes a reference to the MsfsHandler instance.
   * @param msfsHandler The MsfsHandler instance that is used to communicate with the simulator.
   */
  explicit ExampleModule(MsfsHandler& msfsHandler) : Module(msfsHandler){};

  bool initialize() override;
  bool preUpdate(sGaugeDrawData* pData) override;
  bool update(sGaugeDrawData* pData) override;
  bool postUpdate(sGaugeDrawData* pData) override;
  bool shutdown() override;

 private:
  // key event test function
  void keyEventTest(DWORD param0, DWORD param1, DWORD param2, DWORD param3, DWORD param4) {
    std::cout << "ExampleModule::keyEventTest() - param0 = " << param0 << " param1 = " << param1 << " param2 = " << param2
              << " param3 = " << param3 << " param4 = " << param4 << std::endl;
  }

  // Fowler-Noll-Vo hash function
  uint64_t fingerPrintFVN(std::vector<BYTE>& data) {
    const uint64_t FNV_offset_basis = 14695981039346656037ULL;
    const uint64_t FNV_prime = 1099511628211ULL;
    uint64_t hash = FNV_offset_basis;
    for (BYTE c : data) {
      hash ^= static_cast<uint64_t>(c);
      hash *= FNV_prime;
    }
    return hash;
  }

  std::chrono::time_point<std::chrono::steady_clock, std::chrono::duration<long long int, std::nano>> receiptTimerStart;
  std::chrono::duration<long long int, std::nano> receiptTimerEnd;
};

#endif  // FLYBYWIRE_EXAMPLEMODULE_H

#endif  // EXAMPLES
