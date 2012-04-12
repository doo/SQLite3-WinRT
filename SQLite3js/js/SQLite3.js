(function () {

  function Database(dbPath) {
    this.db = SQLite3.Database(dbPath);
  }

  Database.prototype.execute = function (sql, args) {
    var statement;

    statement = this.db.prepare(sql);
    bindArgs(statement, args);
    return executeStatement(statement);
  };

  Database.prototype.close = function () {
    this.db.close();
  };

  function bindArgs(statement, args) {
    var i, len, arg, index, resultCode;

    if (args) {
      for (i = 0, len = args.length; i < len; i++) {
        arg = args[i];
        index = i + 1;
        switch (typeof arg) {
          case 'number':
            if (arg === +arg && arg === (arg | 0)) {
              resultCode = statement.bindInt(index, arg);
            } else {
              resultCode = statement.bindDouble(index, arg);
            }
            break;
          case 'string':
            resultCode = statement.bindText(index, arg);
            break;
          default:
            throw new Error("Unsupported argument type.");
        }
        if (resultCode !== SQLite3.ResultCode.ok) {
          throw new Error("Error " + resultCode + " when binding argument to SQL query.");
        }
      }
    }
  };

  function executeStatement(statement) {
    var result = [], row, i, len, name;

    while (statement.step() === SQLite3.ResultCode.row) {
      row = {};
      for (i = 0, len = statement.columnCount() ; i < len; i++) {
        name = statement.columnName(i);
        switch (statement.columnType(i)) {
          case SQLite3.Datatype.integer:
            row[name] = statement.columnInt(i);
            break;
          case SQLite3.Datatype.float:
            row[name] = statement.columnDouble(i);
            break;
          case SQLite3.Datatype.text:
            row[name] = statement.columnText(i);
            break;
          case SQLite3.Datatype["null"]:
            row[name] = null;
        }
      }
      result.push(row);
    }
    return result;
  };

  WinJS.Namespace.define('SQLite3js', {
    Database: Database
  });

})();
