#pragma once;

#include <memory>
#include <vector>
#include <wrl\client.h>
#include "sqlite3.h"

namespace SQLite3 {
  ref class Database;
  class Statement;
  typedef std::unique_ptr<Statement> StatementPtr;

  typedef Windows::Foundation::Collections::IVectorView<Platform::Object^> ParameterVector;
  typedef std::vector<Platform::Object^> SafeParameterVector;

  typedef Windows::Foundation::Collections::PropertySet ParameterMap;

  public delegate void EachCallback(Platform::String^);

  using Windows::Foundation::IAsyncAction;
  using Windows::Foundation::IAsyncOperation;

  void throwSQLiteError(int resultCode, Platform::String^ message = nullptr);
  std::wstring ToWString(const char* utf8String, unsigned int length = -1);
  Platform::String^ ToPlatformString(const char* utf8String, unsigned int length = -1);

  template <typename To>
  Microsoft::WRL::ComPtr<To> winrt_as(Platform::Object^ const from) {
    Microsoft::WRL::ComPtr<To> to;
    if (S_OK != (reinterpret_cast<IUnknown *>(from)->QueryInterface(to.GetAddressOf()))) {
      return nullptr;
    }
    else {
      return to;
    }
  }  
}
