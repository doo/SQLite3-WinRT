(function () {
  "use strict";

  var Database, ItemDataSource, GroupDataSource;

  // Alternative typeof implementation yielding more meaningful results,
  // see http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
  function type(obj) {
    var typeString;

    typeString = Object.prototype.toString.call(obj);
    return typeString.substring(8, typeString.length - 1).toLowerCase();
  }

  function toObject(propertySet) {
    function toObjectImpl(propertySet) {
      var key, object = {};

      for (key in propertySet) {
        if (propertySet.hasOwnProperty(key)) {
          object[key] = propertySet[key];
        }
      }

      return object;
    }

    return propertySet ? toObjectImpl(propertySet) : null;
  }

  function toPropertySet(object) {
    var key, propertySet = new Windows.Foundation.Collections.PropertySet();

    for (key in object) {
      if (object.hasOwnProperty(key)) {
        propertySet.insert(key, object[key]);
      }
    }

    return propertySet;
  }

  function prepareArgs(args) {
    args = args || [];
    return (args instanceof Array) ? args : toPropertySet(args);
  }

  function wrapComException(comException) {
    var resultCode = comException.number & 0xffff;

    return WinJS.Promise.wrapError({
      message: 'SQLite Error (Result Code ' + resultCode + ')',
      resultCode: resultCode
    });
  }

  function wrapDatabase(connection) {
    function callNative(funcName, sql, args, callback) {
      var result, preparedArgs = prepareArgs(args);

      try {
        if (preparedArgs instanceof Windows.Foundation.Collections.PropertySet) {
          result = connection[funcName + "Map"](sql, preparedArgs, callback);
        } else {
          result = connection[funcName + "Vector"](sql, preparedArgs, callback);
        }
        return WinJS.Promise.wrap(result);
      } catch (e) {
        return WinJS.Promise.wrapError(e);
      }

    }

    var that = {
      runAsync: function (sql, args) {
        return callNative('run', sql, args).then(function () {
          return that;
        }, wrapComException);
      },
      oneAsync: function (sql, args) {
        return callNative('one', sql, args).then(function (row) {
          return toObject(row);
        }, wrapComException);
      },
      allAsync: function (sql, args) {
        return callNative('all', sql, args).then(function (rows) {
          return rows.map(toObject);
        }, wrapComException);
      },
      eachAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = undefined;
        }

        return callNative('each', sql, args, function (row) {
          callback(toObject(row));
        }).then(function () {
          return that;
        }, wrapComException);
      },
      mapAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = undefined;
        }

        var results = [];

        return that.eachAsync(sql, args, function (row) {
          results.push(callback(row));
        }).then(function () {
          return results;
        });
      },
      getLastInsertRowId: function () {
        return connection.getLastInsertRowId();
      },
      getAutocommit: function () {
        return connection.getAutocommit();
      },
      getLastError: function () {
        return connection.getLastError();
      },
      itemDataSource: function (sql, args, keyColumnName, groupKeyColumnName) {
        if (typeof args === 'string') {
          groupKeyColumnName = keyColumnName;
          keyColumnName = args;
          args = undefined;
        }

        return new ItemDataSource(that, sql, args, keyColumnName, groupKeyColumnName);
      },
      groupDataSource: function (sql, args, keyColumnName, sizeColumnName) {
        if (typeof args === 'string') {
          sizeColumnName = keyColumnName;
          keyColumnName = args;
          args = undefined;
        }

        return new GroupDataSource(that, sql, args, keyColumnName, sizeColumnName);
      },
      close: function () {
        connection.close();
      }
    };

    return that;
  }

  ItemDataSource = WinJS.Class.derive(WinJS.UI.VirtualizedDataSource,
    function (db, sql, args, keyColumnName, groupKeyColumnName) {
      this._dataAdapter = {
        _sql: sql,
        getCount: function () {
          return db.oneAsync('SELECT COUNT(*) AS cnt FROM (' + this._sql + ')', args)
            .then(function (row) { return row.cnt; });
        },
        itemsFromIndex: function (requestIndex, countBefore, countAfter) {
          var items,
              limit = countBefore + 1 + countAfter,
              offset = requestIndex - countBefore,
              that = this;

          return this.getCount().then(function (totalCount) {
            return db.mapAsync(
              'SELECT * FROM (' + that._sql + ') LIMIT ' + limit + ' OFFSET ' + offset,
              function (row) {
                var item = {
                  key: row[keyColumnName].toString(),
                  data: row
                };
                if (groupKeyColumnName) {
                  if (!row.hasOwnProperty(groupKeyColumnName) || row[groupKeyColumnName] === null) {
                    throw "Group key property not found: " + groupKeyColumnName;
                  }
                  item.groupKey = row[groupKeyColumnName].toString();
                }
                return item;
              }).then(function (items) {
                return {
                  items: items,
                  offset: countBefore,
                  totalCount: totalCount
                };
              })
          });
        },
        setQuery: function (sql) {
          this._sql = sql;
        }
      };

      this._baseDataSourceConstructor(this._dataAdapter);
    }, {
      setQuery: function (sql) {
        this._dataAdapter.setQuery(sql);
        this.invalidateAll();
      }
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
            dataAdapter._groups = groups.filter(function (group) { return group.groupSize > 0; });
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
    try {
      var connection = SQLite3.Database.open(dbPath);
      return WinJS.Promise.as(wrapDatabase(connection));
    } catch (e) {
      return wrapComException(e);
    }
  }

  WinJS.Namespace.define('SQLite3JS', {
    openAsync: openAsync
  });

}());
