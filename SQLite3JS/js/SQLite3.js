(function () {
  "use strict";

  var Statement, Database, ItemDataSource, GroupDataSource;

  // Alternative typeof implementation yielding more meaningful results,
  // see http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
  function type(obj) {
    var typeString;

    typeString = Object.prototype.toString.call(obj);
    return typeString.substring(8, typeString.length - 1).toLowerCase();
  }

  function toSQLiteError(comException, message) {
    var error = new Error(message);
    error.resultCode = comException.number & 0xffff;
    return error;
  }

  Statement = WinJS.Class.define(function (statement, args) {
    this.statement = statement;

    if (args) {
      this.bind(args);
    }
  }, {
    bind: function (args) {
      var index, resultCode;

      args.forEach(function (arg, i) {
        index = i + 1;
        switch (type(arg)) {
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
          case 'null':
            resultCode = this.statement.bindNull(index);
            break;
          default:
            throw new Error("Unsupported argument type: " + type(arg));
        }
        if (resultCode !== SQLite3.ResultCode.ok) {
          throw new Error("Error " + resultCode + " when binding argument to SQL query.");
        }
      }, this);
    },
    run: function () {
      this.statement.step();
    },
    one: function () {
      this.statement.step();
      return this._getRow();
    },
    all: function () {
      var result = [];

      this.each(function (row) {
        result.push(row);
      });
      return result;
    },
    each: function (callback) {
      while (this.statement.step() === SQLite3.ResultCode.row) {
        callback(this._getRow());
      }
    },
    map: function (callback) {
      var result = [];

      this.each(function (row) {
        result.push(callback(row));
      });
      return result;
    },
    close: function () {
      this.statement.close();
    },
    _getRow: function () {
      var i, len, name, row = {};

      for (i = 0, len = this.statement.columnCount() ; i < len; i += 1) {
        name = this.statement.columnName(i);
        row[name] = this._getColumn(i);
      }

      return row;
    },
    _getColumn: function (index) {
      switch (this.statement.columnType(index)) {
        case SQLite3.Datatype.integer:
          return this.statement.columnInt(index);
        case SQLite3.Datatype.float:
          return this.statement.columnDouble(index);
        case SQLite3.Datatype.text:
          return this.statement.columnText(index);
        case SQLite3.Datatype["null"]:
          return null;
        default:
          throw new Error('Unsupported column type in column ' + index);
      }
    }
  });

  Database = WinJS.Class.define(function (connection) {
    this.connection = connection;
  }, {
    runAsync: function (sql, args) {
      return this.connection.runAsync(sql, args).then(function () {
      }, function (error) {
        return WinJS.Promise.wrapError(toSQLiteError(error));
      });
    },
    oneAsync: function (sql, args) {
      return this.connection.oneAsync(sql, args).then(function (row) {
        return row;
      }, function (error) {
        return WinJS.Promise.wrapError(toSQLiteError(error));
      });
    },
    allAsync: function (sql, args) {
      return this.connection.allAsync(sql, args).then(function (rows) {
        return rows;
      }, function (error) {
        return WinJS.Promise.wrapError(toSQLiteError(error));
      });
    },
    eachAsync: function (sql, args, callback) {
      if (!callback && type(args) === 'function') {
        callback = args;
        args = null;
      }

      return this.connection.eachAsync(sql, args, callback).then(function () {
      }, function (error) {
        return WinJS.Promise.wrapError(toSQLiteError(error));
      });
    },
    mapAsync: function (sql, args, callback) {
      if (!callback && type(args) === 'function') {
        callback = args;
        args = null;
      }

      var results = [];

      return this.eachAsync(sql, args, function (row) {
        results.push(callback(row));
      }).then(function () {
        return results;
      });
    },
    prepareAsync: function (sql, args) {
      return this.connection.prepareAsync(sql).then(function (statement) {
        return new Statement(statement, args);
      }, function (error) {
        var sqliteError = toSQLiteError(error, 'Error preparing an SQLite statement.');
        return WinJS.Promise.wrapError(sqliteError);
      });
    },
    itemDataSource: function (sql, args, keyColumnName, groupKeyColumnName) {
      if (type(args) === 'string') {
        groupKeyColumnName = keyColumnName;
        keyColumnName = args;
        args = undefined;
      }

      return new ItemDataSource(this, sql, args, keyColumnName, groupKeyColumnName);
    },
    groupDataSource: function (sql, args, keyColumnName, sizeColumnName) {
      if (type(args) === 'string') {
        sizeColumnName = keyColumnName;
        keyColumnName = args;
        args = undefined;
      }

      return new GroupDataSource(this, sql, args, keyColumnName, sizeColumnName);
    },
    close: function () {
      this.connection.close();
    }
  });

  ItemDataSource = WinJS.Class.derive(WinJS.UI.VirtualizedDataSource,
    function (db, sql, args, keyColumnName, groupKeyColumnName) {
      var dataAdapter = {
        getCount: function () {
          return db.oneAsync('SELECT COUNT(*) AS cnt FROM (' + sql + ')', args)
            .then(function (row) { return row.cnt; });
        },
        itemsFromIndex: function (requestIndex, countBefore, countAfter) {
          var items,
              limit = countBefore + 1 + countAfter,
              offset = requestIndex - countBefore;

          return db.mapAsync(
            'SELECT * FROM (' + sql + ') LIMIT ' + limit + ' OFFSET ' + offset,
            function (row) {
              var item = {
                key: row[keyColumnName].toString(),
                data: row
              };
              if (groupKeyColumnName) {
                item.groupKey = row[groupKeyColumnName].toString();
              }
              return item;
            }).then(function (items) {
              return {
                items: items,
                offset: countBefore,
                atEnd: items.length < limit
              };
            });
        }
      };

      this._baseDataSourceConstructor(dataAdapter);
    }
  );

  GroupDataSource = WinJS.Class.derive(WinJS.UI.VirtualizedDataSource,
    function (db, sql, args, keyColumnName, sizeColumnName) {
      var dataAdapter = {
        _keyIndexMap: {},
        _ensureGroupsAsync: function () {
          if (dataAdapter._groups) {
            return WinJS.Promise.wrap();
          }

          var groupIndex = 0,
              firstItemIndex = 0;
          return db.mapAsync(sql, args, function (row) {
            var item = {
              key: row[keyColumnName].toString(),
              groupSize: row[sizeColumnName],
              firstItemIndexHint: firstItemIndex,
              data: row
            };

            dataAdapter._keyIndexMap[item.key] = groupIndex;
            groupIndex += 1;
            firstItemIndex += item.groupSize;

            return item;
          }).then(function(groups) {
            dataAdapter._groups = groups;
          });
        },
        getCount: function () {
          return dataAdapter._ensureGroupsAsync().then(function() {
            return dataAdapter._groups.length;
          });
        },
        itemsFromIndex: function (requestIndex, countBefore, countAfter) {
          return dataAdapter._ensureGroupsAsync().then(function() {
            return {
              items: dataAdapter._groups.slice(),
              offset: requestIndex,
              absoluteIndex: requestIndex,
              atStart: true,
              atEnd: true
            };
          });
        },
        itemsFromKey: function (key, countBefore, countAfter) {
          return dataAdapter._ensureGroupsAsync().then(function () {
            return dataAdapter.itemsFromIndex(dataAdapter._keyIndexMap[key], countBefore, countAfter);
          });
        }
      };

      this._baseDataSourceConstructor(dataAdapter);
    }
  );

  function openAsync(dbPath) {
    return SQLite3.Database.openAsync(dbPath).then(function (connection) {
      return new Database(connection);
    }, function (error) {
      var sqliteError = toSQLiteError(error, 'Error creating an SQLite database connection.');
      return WinJS.Promise.wrapError(sqliteError);
    });
  }

  WinJS.Namespace.define('SQLite3JS', {
    openAsync: openAsync
  });

}());
