#include <Winerror.h>

#include "Common.h"

namespace SQLite3 {
  void throwSQLiteError(int resultCode) {
    HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, resultCode);
    hresult |= 0x20000000; // Set "customer-defined" bit
    throw ref new Platform::COMException(hresult);
  }
}
