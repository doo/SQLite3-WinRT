(function () {
  "use strict";

  var Statement, Database;

  Statement = WinJS.Class.define(function (statement) {
    this.statement = statement;
  }, {
    bindArgs: function (args) {
      var index, resultCode;

      if (args) {
        args.forEach(function (arg, i) {
          index = i + 1;
          switch (typeof arg) {
            case 'number':
              if (arg % 1 === 0) {
                resultCode = this.statement.bindInt(index, arg);
              } else {
                resultCode = this.statement.bindDouble(index, arg);
              }
              break;
            case 'string':
              resultCode = this.statement.bindText(index, arg);
              break;
            default:
              throw new Error("Unsupported argument type.");
          }
          if (resultCode !== SQLite3.ResultCode.ok) {
            throw new Error("Error " + resultCode + " when binding argument to SQL query.");
          }
        }, this);
      }
    },
    execute: function () {
      var result = [], row, i, len, name;

      while (this.statement.step() === SQLite3.ResultCode.row) {
        row = {};
        for (i = 0, len = this.statement.columnCount() ; i < len; i += 1) {
          name = this.statement.columnName(i);
          switch (this.statement.columnType(i)) {
            case SQLite3.Datatype.integer:
              row[name] = this.statement.columnInt(i);
              break;
            case SQLite3.Datatype.float:
              row[name] = this.statement.columnDouble(i);
              break;
            case SQLite3.Datatype.text:
              row[name] = this.statement.columnText(i);
              break;
            case SQLite3.Datatype["null"]:
              row[name] = null;
              break;
          }
        }
        result.push(row);
      }
      return result;
    },
    close: function () {
      this.statement.close();
    }
  });

  Database = WinJS.Class.define(function (dbPath) {
    this.db = SQLite3.Database(dbPath);
  }, {
    execute: function (sql, args) {
      var statement, rows;

      statement = new Statement(this.db.prepare(sql));
      statement.bindArgs(args);
      rows = statement.execute();
      statement.close();
      return rows;
    },
    close: function () {
      this.db.close();
    }
  });

  WinJS.Namespace.define('SQLite3js', {
    Database: Database
  });

}());
