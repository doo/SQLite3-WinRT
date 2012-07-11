(function () {
  "use strict";

  var Database, ItemDataSource, GroupDataSource;

  function wrapComException(comException) {
    return WinJS.Promise.wrapError({
      message: 'SQLite Error',
      resultCode: comException.number & 0xffff
    });
  }

  function wrapDatabase(connection) {
    var that = {
      runAsync: function (sql, args) {
        return connection.runAsync(sql, args).then(function () {
          return that;
        }, wrapComException);
      },
      oneAsync: function (sql, args) {
        return connection.oneAsync(sql, args).then(function (row) {
          return row;
        }, wrapComException);
      },
      allAsync: function (sql, args) {
        return connection.allAsync(sql, args).then(function (rows) {
          return rows;
        }, wrapComException);
      },
      eachAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = null;
        }

        return connection.eachAsync(sql, args, callback).then(function () {
          return that;
        }, wrapComException);
      },
      mapAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = null;
        }

        var results = [];

        return that.eachAsync(sql, args, function (row) {
          results.push(callback(row));
        }).then(function () {
          return results;
        });
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

    that.addEventListener = connection.addEventListener.bind(connection);
    that.removeEventListener = connection.removeEventListener.bind(connection);
    Object.defineProperties(that, WinJS.Utilities.createEventProperties('updated', 'deleted', 'inserted'));
    
    return that;
  }

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
      return wrapDatabase(connection);
    }, wrapComException);
  }

  WinJS.Namespace.define('SQLite3JS', {
    openAsync: openAsync
  });

}());
