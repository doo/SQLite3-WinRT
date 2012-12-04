#pragma once;

#include <memory>
#include <vector>

namespace SQLite3 {
  ref class Database;
  class Statement;
  typedef std::unique_ptr<Statement> StatementPtr;

  typedef Windows::Foundation::Collections::IVectorView<Platform::Object^> ParameterVector;
  typedef Windows::Foundation::Collections::PropertySet ParameterMap;

  public delegate void EachCallback(Platform::String^);

  using Windows::Foundation::IAsyncAction;
  using Windows::Foundation::IAsyncOperation;

  void throwSQLiteError(int resultCode);
  std::wstring ToWString(const char* utf8String, unsigned int length = -1);
  Platform::String^ ToPlatformString(const char* utf8String, unsigned int length = -1);
}
