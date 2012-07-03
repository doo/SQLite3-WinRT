#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  class Statement {
  public:
    static StatementPtr Prepare(sqlite3* sqlite, Platform::String^ sql);
    ~Statement();

    void Bind(const SafeParameters& params);
    void Run();
    Row^ One();
    Rows^ All();
    void Each(EachCallback^ callback, Windows::UI::Core::CoreDispatcher^ dispatcher);

  private:
    Statement(sqlite3_stmt* statement);

    Row^ GetRow();
    Platform::Object^ GetColumn(int index);

    int Step();

    int ColumnCount();
    int ColumnType(int index);
    Platform::String^ ColumnName(int index);

    Platform::String^ ColumnText(int index);
    int64 ColumnInt(int index);
    double ColumnDouble(int index);

    int BindText(int index, Platform::String^ val);
    int BindInt(int index, int val);
    int BindDouble(int index, double val);
    int BindNull(int index);

  private:
    sqlite3_stmt* statement;
  };
}
