(function () {
  "use strict";

  var Database, ItemDataSource, GroupDataSource;

  function wrapComException(comException) {
    return WinJS.Promise.wrapError({
      message: 'SQLite Error',
      resultCode: comException.number & 0xffff
    });
  }

  Database = WinJS.Class.define(function (connection) {
    this.connection = connection;
  }, {
    runAsync: function (sql, args) {
      return this.connection.runAsync(sql, args).then(function () {
      }, wrapComException);
    },
    oneAsync: function (sql, args) {
      return this.connection.oneAsync(sql, args).then(function (row) {
        return row;
      }, wrapComException);
    },
    allAsync: function (sql, args) {
      return this.connection.allAsync(sql, args).then(function (rows) {
        return rows;
      }, wrapComException);
    },
    eachAsync: function (sql, args, callback) {
      if (!callback && typeof args === 'function') {
        callback = args;
        args = null;
      }

      return this.connection.eachAsync(sql, args, callback).then(function () {
      }, wrapComException);
    },
    mapAsync: function (sql, args, callback) {
      if (!callback && typeof args === 'function') {
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
    itemDataSource: function (sql, args, keyColumnName, groupKeyColumnName) {
      if (typeof args === 'string') {
        groupKeyColumnName = keyColumnName;
        keyColumnName = args;
        args = undefined;
      }

      return new ItemDataSource(this, sql, args, keyColumnName, groupKeyColumnName);
    },
    groupDataSource: function (sql, args, keyColumnName, sizeColumnName) {
      if (typeof args === 'string') {
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
    }, wrapComException);
  }

  WinJS.Namespace.define('SQLite3JS', {
    openAsync: openAsync
  });

}());
