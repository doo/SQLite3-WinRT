#pragma once;

namespace SQLite3 {
  ref class Database;
  class Statement;
  typedef std::unique_ptr<Statement> StatementPtr;

  typedef Windows::Foundation::Collections::IKeyValuePair<Platform::String^, Platform::Object^> Parameter;
  typedef Windows::Foundation::Collections::IVectorView<Platform::Object^> Parameters;
  typedef Windows::Foundation::Collections::PropertySet Row;

  using Windows::Foundation::IAsyncAction;
  using Windows::Foundation::IAsyncOperation;
}
