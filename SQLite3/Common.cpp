#include <Windows.h>

#include "Common.h"

namespace SQLite3 {
  std::wstring toWString(const char* utf8String) {
    DWORD numCharacters = MultiByteToWideChar(CP_UTF8, 0, utf8String, -1, nullptr, 0);
    auto wideText = new std::wstring::value_type[numCharacters];
    MultiByteToWideChar(CP_UTF8, 0, utf8String, -1, wideText, numCharacters);
    std::wstring result(wideText);
    delete[] wideText;
    return result;
  }

  Platform::String^ toPlatformString(const char* utf8String) {
    return ref new Platform::String(toWString(utf8String).data());
  }
}
