#pragma once;

namespace SQLite3 {
  ref class Database;
  class Statement;
  typedef std::unique_ptr<Statement> StatementPtr;

  typedef Windows::Foundation::Collections::IVectorView<Platform::Object^> ParameterVector;
  typedef std::vector<Platform::Object^> SafeParameterVector;

  typedef Windows::Foundation::Collections::IMapView<Platform::String^, Platform::Object^> Row;
  typedef Windows::Foundation::Collections::IVectorView<Row^> Rows;

  public delegate void EachCallback(Row^);

  using Windows::Foundation::IAsyncAction;
  using Windows::Foundation::IAsyncOperation;
}
