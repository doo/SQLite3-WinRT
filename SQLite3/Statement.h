#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  ref class Database;

  public ref class Statement sealed {
  public:
    static IAsyncOperation<Statement^>^ PrepareAsync(Database^ database, Platform::String^ sql);

    ~Statement();

    int Step();

    int ColumnCount();
    int ColumnType(int index);
    Platform::String^ ColumnName(int index);

    Platform::String^ ColumnText(int index);
    int ColumnInt(int index);
    double ColumnDouble(int index);

    int BindText(int index, Platform::String^ val);
    int BindInt(int index, int val);
    int BindDouble(int index, double val);
    int BindNull(int index);

  private:
    Statement(sqlite3_stmt* statement);

    sqlite3_stmt* statement;
  };
}
