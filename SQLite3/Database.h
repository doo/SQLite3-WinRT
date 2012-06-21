#pragma once

#include "sqlite3.h"

namespace SQLite3 {
  ref class Statement;

  using Windows::Foundation::IAsyncOperation;

  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);

    ~Database();

    Statement^ Prepare(Platform::String^ sql);

  private:
    friend Statement;

    Database(sqlite3* sqlite);

    sqlite3* sqlite;
  };
}
