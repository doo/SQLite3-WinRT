#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  class Statement {
  public:
    static StatementPtr Prepare(sqlite3* sqlite, Platform::String^ sql);
    ~Statement();

    void Bind(const SafeParameterVector& params);
    void Bind(ParameterMap^ params);

    void Run();
    Platform::String^ One();
    Platform::String^ All();
    void Each(EachCallback^ callback, Windows::UI::Core::CoreDispatcher^ dispatcher);

    bool ReadOnly() const;

  private:
    Statement(sqlite3_stmt* statement);

    void BindParameter(int index, Platform::Object^ value);
    int BindParameterCount();
    std::wstring BindParameterName(int index);
    
    int Step();
    void GetRow(std::wostringstream& row);
    
    int ColumnCount();
    int ColumnType(int index);
    
  private:
    HANDLE dbLockMutex;
    sqlite3_stmt* statement;
  };
}
