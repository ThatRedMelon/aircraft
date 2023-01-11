#pragma once

#include <MSFS/MSFS_Core.h>
#include <map>
#include <memory>

#include "../simconnect/connection.hpp"
#include "configuration.h"
#include "display.h"

namespace navigationdisplay {

class Collection {
 private:
  struct EgpwcData {
    types::Arinc429Word<float> destinationLatitude;
    types::Arinc429Word<float> destinationLongitude;
    types::Arinc429Word<float> presentLatitude;
    types::Arinc429Word<float> presentLongitude;
    types::Arinc429Word<float> altitude;
    types::Arinc429Word<float> heading;
    types::Arinc429Word<float> verticalSpeed;
    bool gearIsDown;
  };

  struct GroundTruthPosition {
    types::Angle latitude;
    types::Angle longitude;
  };

  std::uint32_t _pixelWidth;
  std::uint32_t _pixelHeight;
  std::map<FsContext, std::shared_ptr<DisplayBase>> _displays;
  GroundTruthPosition _groundTruth;
  EgpwcData _egpwcData;
  DisplayBase::NdConfiguration _configurationLeft;
  DisplayBase::NdConfiguration _configurationRight;
  bool _sendAircraftStatus;
  bool _reconfigureDisplayLeft;
  bool _reconfigureDisplayRight;

  // inputs
  std::shared_ptr<simconnect::SimObject<types::SimulatorData>> _simulatorData;
  std::shared_ptr<simconnect::LVarObject<EgpwcDestinationLat,
                                         EgpwcDestinationLong,
                                         EgpwcPresentLat,
                                         EgpwcPresentLong,
                                         Adirs1Altitude,
                                         Adirs1TrueHeading,
                                         Adirs1VerticalSpeed,
                                         EgpwcGearIsDown>>
      _aircraftStatus;
  std::shared_ptr<simconnect::LVarObject<EgpwcNdLeftRange,
                                         EfisNdLeftMode,
                                         EgpwcTerrOnNdLeftActive,
                                         EgpwcNdRightRange,
                                         EfisNdRightMode,
                                         EgpwcTerrOnNdRightActive>>
      _ndConfiguration;

  // outputs
  std::shared_ptr<simconnect::ClientDataArea<types::AircraftStatusData>> _simconnectAircraftStatus;

 public:
  Collection(simconnect::Connection& connection, std::uint32_t pixelWidth, std::uint32_t pixelHeight);
  void registerDisplay(DisplaySide side, FsContext context, simconnect::Connection& connection);
  void destroy();

  void updateDisplay(FsContext context);
  void renderDisplay(sGaugeDrawData* pDraw, FsContext context);
};

}  // namespace navigationdisplay