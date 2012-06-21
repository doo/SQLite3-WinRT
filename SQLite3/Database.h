#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  ref class Statement;

  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);

    ~Database();

    IAsyncOperation<Statement^>^ PrepareAsync(Platform::String^ sql);

  private:
    friend Statement;

    Database(sqlite3* sqlite);

    sqlite3* sqlite;
  };
}
