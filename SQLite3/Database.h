#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);
    ~Database();

    IAsyncAction^ RunAsync(Platform::String^ sql, Parameters^ params);
    IAsyncOperation<Row^>^ OneAsync(Platform::String^ sql, Parameters^ params);
    IAsyncOperation<Rows^>^ AllAsync(Platform::String^ sql, Parameters^ params);

  private:
    Database(sqlite3* sqlite);
    StatementPtr PrepareAndBind(Platform::String^ sql, Parameters^ params);

    sqlite3* sqlite;
  };
}
