/// <reference path="/js/SQLite3.js" />
(function () {
  "use strict";

  spec.require("js/SQlite3.js");

  describe('SQLite3JS', function () {
    var db = null;

    beforeEach(function () {
      spec.async(
        SQLite3JS.openAsync(':memory:').then(function (newDb) {
          db = newDb;
          return db.runAsync('CREATE TABLE Item (name TEXT, price REAL, dateBought UNSIGNED BIG INT, id INT PRIMARY KEY)').then(function () {
            var promises = [
              db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Apple', 1.2, 1]),
              db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Orange', 2.5, 2]),
              db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Banana', 3, 3])
            ];
            return WinJS.Promise.join(promises);
          });
        })
      );
    });

    afterEach(function () {
      spec.async(
        db.runAsync('DROP TABLE Item').then(function () {
          db.close();
          db = null;
        })
      );
    });

    describe('runAsync()', function () {
      it('should allow binding null arguments', function () {
        var name = 'Mango';

        spec.async(
          db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', [name, null, null])
          .then(function () {
            return db.oneAsync('SELECT * FROM Item WHERE name = ?', [name]);
          }).then(function (row) {
            expect(row.name).toEqual(name);
            expect(row.price).toEqual(null);
            expect(row.id).toEqual(null);
          })
        );
      });

      it('should support binding javascript date arguments', function () {
        var name = 'Melon',
            dateBought = new Date();

        spec.async(
          db.runAsync('INSERT INTO Item (name, dateBought) VALUES (?, ?)', [name, dateBought])
          .then(function () {
            return db.oneAsync('SELECT * FROM Item WHERE dateBought=?', [dateBought]);
          }).then(function (row) {
            expect(row.name).toEqual(name);
            expect(new Date(row.dateBought)).toEqual(dateBought);
          })
        );
      });

      it('should allow binding arguments by name', function () {
        spec.async(
          db.runAsync(
            'INSERT INTO Item (name, price, id) VALUES (:name, :price, :id)',
            { name: 'Papaya', price: 5.2, id: 4 })
          .then(function () {
            return db.oneAsync(
              'SELECT COUNT(*) AS cnt FROM Item WHERE price > :limit',
              { limit: 5 });
          }).then(function (row) {
            expect(row.cnt).toEqual(1);
          })
        );
      });

      it('should return the number of affected rows', function () {
        spec.async(
          db.runAsync('DELETE FROM Item')
          .then(function (affectedRows) {
            expect(affectedRows).toEqual(3);
          })
        );
      });
    });

    describe('oneAsync()', function () {
      it('should return the correct count', function () {
        spec.async(
          db.oneAsync('SELECT COUNT(*) AS count FROM Item').then(function (row) {
            expect(row.count).toEqual(3);
          })
        );
      });

      it('should return an item by id', function () {
        spec.async(
          db.oneAsync('SELECT * FROM Item WHERE id = ?', [2]).then(function (row) {
            expect(row.name).toEqual('Orange');
            expect(row.price).toEqual(2.5);
            expect(row.id).toEqual(2);
          })
        );
      });

      it('should return null for empty queries', function () {
        spec.async(
          db.oneAsync('SELECT * FROM Item WHERE name = ?', ['BEEF']).then(function (row) {
            expect(row).toBeNull();
          })
        );
      });

      it('should support special characters in strings', function () {
        var rowToInsert = {
          name: "Foo\nBar'n"
        };
        spec.async(
          db.runAsync('INSERT INTO Item(name) VALUES(:name)', rowToInsert)
          .then(function () {
            var id = db.lastInsertRowId;
            return db.oneAsync('SELECT * FROM Item WHERE rowId=?', [id]);
          }).then(function (result) {
            expect(result.name).toEqual("Foo\nBar'n");
          })
        );
      });
    });

    describe('allAsync()', function () {
      it('should return items with names ending on "e"', function () {
        spec.async(
          db.allAsync(
            'SELECT * FROM Item WHERE name LIKE :pattern ORDER BY id ASC',
            { pattern: '%e' })
          .then(function (rows) {
            expect(rows.length).toEqual(2);
            expect(rows[0].name).toEqual('Apple');
            expect(rows[1].name).toEqual('Orange');
          })
        );
      });

      it('should return empty array for empty queries', function () {
        spec.async(
          db.allAsync('SELECT * FROM Item WHERE id < ?', [0]).then(function (rows) {
            expect(rows.length).toEqual(0);
          })
        );
      });

    it('should allow cancellation', function () {
      var promise, thisSpec = this;

        promise = db.allAsync('SELECT * FROM Item ORDER BY id').then(function () {
          thisSpec.fail('Promise did not fail as expected.');
        }, function (error) {
          expect(error.message).toEqual('Canceled');
        });

        promise.cancel();

        spec.async(promise);
      });
    });

    describe('eachAsync()', function () {
      var ids;

      beforeEach(function () {
        ids = [];
        this.rememberId = function (row) { ids.push(row.id); };
      });

      it('should call a callback for each row', function () {
        spec.async(
          db.eachAsync('SELECT * FROM Item ORDER BY id', this.rememberId).then(function () {
            expect(ids).toEqual([1, 2, 3]);
          })
        );
      });

      it('should allow binding arguments', function () {
        spec.async(
          db.eachAsync('SELECT * FROM Item WHERE price > ? ORDER BY id', [2], this.rememberId)
          .then(function () {
            expect(ids).toEqual([2, 3]);
          })
        );
      });

      it('should allow binding arguments by name', function () {
        spec.async(
          db.eachAsync(
            'SELECT * FROM Item WHERE price < :max ORDER BY id',
            { max: 3 },
            this.rememberId).then(function () {
              expect(ids).toEqual([1, 2]);
            })
        );
      });

    xit('should allow cancellation in the callback', function () {
      var promise, thisSpec = this;

        function cancel(row) {
          promise.cancel();
        }

        promise = db.eachAsync('SELECT * FROM Item ORDER BY id', cancel).then(function () {
          thisSpec.fail('Promise did not fail as expected.');
        }, function (error) {
          expect(error.message).toEqual('Canceled');
        });

        spec.async(promise);
      });
    });

    describe('mapAsync()', function () {
      it('should map a function over all rows', function () {
        spec.async(
          db.mapAsync('SELECT * FROM Item ORDER BY id', function (row) {
            return row.price > 2 ? 'expensive' : 'cheap';
          }).then(function (rating) {
            expect(rating.length).toEqual(3);
            expect(rating[0]).toEqual('cheap');
            expect(rating[1]).toEqual('expensive');
            expect(rating[2]).toEqual('expensive');
          })
        );
      });
    });

    describe('lastInsertRowId', function () {
      it('should retrieve the id of the last inserted row', function () {
        spec.async(
          db.runAsync("INSERT INTO Item (name) VALUES (?)", ['Ananas']).then(function () {
            var id = db.lastInsertRowId;
            expect(id).toEqual(4);
          })
        );
      });
    });

    describe("Sorting", function () {
      beforeEach(function () {
        spec.async(
          db.runAsync("CREATE TABLE SortTest (name TEXT COLLATE WINLOCALE)").then(function () {
            return db.runAsync("INSERT INTO SortTest VALUES (?)", ["Foo20"]);
          }).then(function () {
            return db.runAsync("INSERT INTO SortTest VALUES (?)", ["Foo"]);
          }).then(function () {
            return db.runAsync("INSERT INTO SortTest VALUES (?)", ["Foo3"]);
          })
        );
      });

      afterEach(function () {
        spec.async(
          db.runAsync("DROP TABLE SortTest")
        );
      });

      it("should order numbers according to value", function () {
        spec.async(
          db.allAsync("SELECT * FROM SortTest ORDER BY name").then(function (rows) {
            expect(rows[0].name).toEqual("Foo");
            expect(rows[1].name).toEqual("Foo3");
            expect(rows[2].name).toEqual("Foo20");
          })
        );
      });


    });
    describe("Locale-specific Collation", function () {
      beforeEach(function () {
        spec.async(
          db.runAsync("CREATE TABLE CollateTest (name TEXT COLLATE WINLOCALE)").then(function () {
            return db.runAsync("INSERT INTO CollateTest VALUES (?)", ["Lj"]);
          }).then(function () {
            return db.runAsync("INSERT INTO CollateTest VALUES (?)", ["Lz"]);
          }).then(function () {
            return db.runAsync("INSERT INTO CollateTest VALUES (?)", ["La"]);
          })
        );
      });

      afterEach(function () {
        spec.async(
          db.runAsync("DROP TABLE CollateTest")
        );
      });

      it('should support english collation', function () {
        db.collationLanguage = "en-US";
        spec.async(
          db.allAsync("SELECT * FROM CollateTest ORDER BY name").then(function (rows) {
            expect(rows[0].name).toEqual("La");
            expect(rows[1].name).toEqual("Lj");
            expect(rows[2].name).toEqual("Lz");
          })
        );
      });

      it('should support bosnian collation', function () {
        db.collationLanguage = "bs-Latn-BA";
        spec.async(
          db.allAsync("SELECT * FROM CollateTest ORDER BY name").then(function (rows) {
            expect(rows[0].name).toEqual("La");
            expect(rows[1].name).toEqual("Lz");
            expect(rows[2].name).toEqual("Lj");
          })
        );
      });
    });

    it("should support the REGEXP operator", function () {
      spec.async(
        db.allAsync("SELECT * FROM Item WHERE name REGEXP '.*a'").then(function (rows) {
          expect(rows.length).toEqual(2);
        })
      );
    });

    describe("Win8 app translation", function () {
      it("should translate from database queries using default resource", function () {
        spec.async(
          db.oneAsync("SELECT APPTRANSLATE(?) AS translation", ["testString1"]).then(function (row) {
            expect(row.translation).toEqual("Hello World!");
          })
        );
      });
      it("should translate from database queries using specific resource", function () {
        spec.async(
          db.oneAsync("SELECT APPTRANSLATE(?,?) AS translation", ["secondary", "testString1"]).then(function (row) {
            expect(row.translation).toEqual("Goodbye World.");
          })
        );
      });
    });

    describe('Events', function () {
      beforeEach(function () {
        db.fireEvents = true;
      });
      afterEach(function () {
        db.fireEvents = false;
      });
      function expectEvent(eventName, rowId, callback) {
        var calledEventHandler = false;

        runs(function () {
          // make sure the event queue is drained of old events
          setImmediate(function () {
            db.addEventListener(eventName, function listener(event) {
              expect(event.tableName).toEqual('Item');
              expect(event.type).toEqual(eventName);
              expect(event.rowId).toEqual(rowId);
              calledEventHandler = true;
            });

            callback();
          });
        });

        waitsFor(function () { return calledEventHandler === true; });
      }

      it('should fire oninsert', function () {
        expectEvent('insert', 4, function () {
          db.runAsync("INSERT INTO Item (name) VALUES (?)", ['Ananas']);
        });
      });

      it('should fire onupdate', function () {
        expectEvent('update', 2, function () {
          db.runAsync(
            "UPDATE Item SET price = :newPrice WHERE name = :name",
            { name: 'Orange', newPrice: 0.9 });
        });
      });

      it('should fire ondelete', function () {
        expectEvent('delete', 1, function () {
          db.runAsync("DELETE FROM Item WHERE name = ?", ['Apple']);
        });
      });
    });

    describe('Concurrency Handling', function () {
      it('should support two concurrent connections', function () {
        var tempFolder = Windows.Storage.ApplicationData.current.temporaryFolder,
            dbFilename = tempFolder.path + "\\concurrencyTest.sqlite",
            db1 = null, db2 = null;

        SQLite3.Database.sharedCache = true;

        spec.async(
          SQLite3JS.openAsync(dbFilename)
          .then(function (newDb) {
            db1 = newDb;
            return db1.runAsync(
              "CREATE TABLE IF NOT EXISTS TestData (id INTEGER PRIMARY KEY, value TEXT)");
          }).then(function () {
            return db1.runAsync("DELETE FROM TestData");
          }).then(function () {
            return SQLite3JS.openAsync(dbFilename)
            .then(function (newDb) {
              db2 = newDb;
              var i, db, promise, promises = [];
              for (i = 0; i < 50; i += 1) {
                db = i % 2 ? db1 : db2;
                promise = db.runAsync("INSERT INTO TestData (value) VALUES (?)", ["Value " + i]);
                promises.push(promise);
              }
              return WinJS.Promise.join(promises);
            }).then(function () {
              return SQLite3JS.openAsync(dbFilename);
            }).then(function (db) {
              return db.oneAsync("SELECT COUNT(*) as rowCount FROM TestData");
            }).then(function (row) {
              expect(row.rowCount).toEqual(50);
            });
          })
        );
      });
    });

    describe('Error Handling', function () {
      it('should throw when creating an invalid database', function () {
        var thisSpec = this;

        spec.async(
          SQLite3JS.openAsync('invalid path').then(function (db) {
            thisSpec.fail('The error handler was not called.');
          }, function (error) {
            expect(error.number & 0x0000ffff).toEqual(2);
          })
        );
      });

      it('should throw when executing an invalid statement', function () {
        var thisSpec = this;

        spec.async(
          db.runAsync('invalid sql').then(function () {
            thisSpec.fail('The error handler was not called.');
          }, function (error) {
            expect(error.number).toEqual(0x80004005/*E_FAIL*/);
            expect(db.lastError).toEqual('near \"invalid\": syntax error');
          })
        );
      });

      it('should fail on invalid bindings', function () {
        var thisSpec = this;

        spec.async(
          db.runAsync('SELECT * FROM Item WHERE name=?', [["Array"]]).then(function () {
            thisSpec.fail('The error handler was not called.');
          }, function (error) {
            expect(error.number & 0x0000ffff).toEqual(1629/*ERROR_DATATYPE_MISMATCH*/);
          })
        );
      });
    });

    describe("Blobs", function () {
      var CryptographicBuffer = Windows.Security.Cryptography.CryptographicBuffer;

      beforeEach(function () {
        spec.async(
          db.runAsync("CREATE TABLE images(title TEXT, img BLOB)")
        );
      });

      afterEach(function () {
        spec.async(db.runAsync("DROP TABLE images"));
      });

      it("should not allow other object types than buffers to be inserted", function () {
        var thisSpec = this;
        spec.async(
          Windows.ApplicationModel.Package.current.installedLocation.getFileAsync("images\\logo.png")
          .then(function gotFile(file) {
            return db.runAsync("INSERT INTO images(title, img) VALUES (?, ?)", ["a title", file]);
          }).then(function shouldNotComplete() {
            thisSpec.fail('Wooot? The error handler was not called.');
          }, function shouldError(error) {
            expect(error.number).toEqual(0x8007065D/*ERROR_DATATYPE_MISMATCH*/);
          })
        );
      });

      it("should allow buffers to be inserted as blobs", function () {
        var originalBuffer;
        spec.async(
          Windows.ApplicationModel.Package.current.installedLocation.getFileAsync("images\\logo.png")
          .then(function gotFile(file) {
            return Windows.Storage.FileIO.readBufferAsync(file)
            .then(function readContent(buffer) {
              return (originalBuffer = buffer);
            });
          }).then(function readBuffer(buffer) {
            return db.runAsync("INSERT INTO images(title, img) VALUES (?, ?)", ["a title", buffer]);
          }).then(function inserted(count) {
            return db.oneAsync("SELECT img FROM images WHERE title='a title'");
          }).then(function selected(row) {
            var div, selectedBuffer = CryptographicBuffer.decodeFromBase64String(row.img);
            expect(CryptographicBuffer.compare(originalBuffer, selectedBuffer)).toBeTruthy();
            // For visual confirmation that everything went ok, display the image on the page
            div = document.createElement("img");
            div.src = 'data:image/png;base64,' + row.img;
            document.body.appendChild(div);
          })
        );
      });
      
    });

    describe('Item Data Source', function () {
      beforeEach(function () {
        this.itemDataSource = db.itemDataSource('SELECT * FROM Item ORDER BY id', 'id');
      });

      it('should support getCount()', function () {
        spec.async(
          this.itemDataSource.getCount().then(function (count) {
            expect(count).toEqual(3);
          })
        );
      });

      it('should support itemFromIndex()', function () {
        spec.async(
          this.itemDataSource.itemFromIndex(1).then(function (item) {
            expect(item.key).toEqual('2');
            expect(item.data.name).toEqual('Orange');
          })
        );
      });
    });

    describe('Group Data Source', function () {
      beforeEach(function () {
        this.groupDataSource = db.groupDataSource(
          'SELECT LENGTH(name) AS key, COUNT(*) AS groupSize FROM Item GROUP BY key',
          'key',
          'groupSize');
      });

      it('should support getCount()', function () {
        spec.async(
          this.groupDataSource.getCount().then(function (count) {
            expect(count).toEqual(2);
          })
        );
      });

      it('should support itemFromIndex()', function () {
        spec.async(
          this.groupDataSource.itemFromIndex(1).then(function (item) {
            expect(item.key).toEqual('6');
            expect(item.groupSize).toEqual(2);
            expect(item.firstItemIndexHint).toEqual(1);
          })
        );
      });

      it('should support itemFromKey()', function () {
        spec.async(
          this.groupDataSource.itemFromKey('5').then(function (item) {
            expect(item.key).toEqual('5');
            expect(item.groupSize).toEqual(1);
            expect(item.firstItemIndexHint).toEqual(0);
          })
        );
      });
    });
  });
}());
