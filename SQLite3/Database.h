#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);
    ~Database();

    IAsyncAction^ RunAsync(Platform::String^ sql, ParameterVector^ params);
    IAsyncOperation<Row^>^ OneAsync(Platform::String^ sql, ParameterVector^ params);
    IAsyncOperation<Rows^>^ AllAsync(Platform::String^ sql, ParameterVector^ params);
    IAsyncAction^ EachAsync(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);

  private:
    Database(sqlite3* sqlite);
    StatementPtr PrepareAndBind(Platform::String^ sql, const SafeParameterVector& params);

    sqlite3* sqlite;
  };
}
