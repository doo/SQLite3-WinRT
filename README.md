# SQLite3-WinRT

Async SQLite for (JavaScript) Windows Store apps.

## Changelog

### 1.3.4

#### Support for blobs

This allows you to insert blobs into your database and read them back as BASE64 encoded values in your JSON result.
See [the blob example](https://github.com/doo/SQLite3-WinRT/tree/master/SQLite3JS/examples/blobs.js) how to use it in your apps.
If you need an IBuffer back from the db you can use [CryptographicBuffer.DecodeFromBase64String](http://msdn.microsoft.com/en-us/library/windows/apps/windows.security.cryptography.cryptographicbuffer.decodefrombase64string).


### 1.1.2

Some minor API changes:

1. `getLastInsertRowId()` function becomes `lastInsertRowId` property
2. `getAutocommit()` function becomes `autoCommit` property
3. `getLastError()` function becomes `lastError` property
4. `enableSharedCache()` function becomes `sharedCache` property


### 1.1.0

This version introduces a **breaking API change** along with some enhancements:

 1. `runAsync` no longer returns the database for chained calls. Instead it will now return the number of rows affected by the executed SQL statement.
 2. A special collation sequence, `WINLOCALE` is introduced. It uses the sorting behaviour of the currently active system locale. The locale can be overridden by setting `db.collationLanguage`.
 3. We also now implemented a `regexp` function based on the STL (TR1) regex functionality. You can now use the `REGEXP` operator, see the SQLite documentation for further information.

As usual, you should look at our unit tests if you are unsure how to use this new functionality.


## Status

We finally consider _SQLite3-WinRT_ ready for production use and it is already
being used by certified apps published in the Windows Store including, of course [our own application](http://apps.microsoft.com/webpdp/app/doo/28631302-9666-4ee3-aaf4-e52c493370e8).
Support for BLOBs and an API for transaction management are still on our to-do list - unfortunately with a very low priority. Feedback and contributions are highly appreciated, feel free to open issues or pull requests on GitHub.


## Setup

_SQLite3-WinRT_ consists of two parts, a WinRT component named
_SQLite3Component_ and a JavaScript namespace called _SQLite3JS_ that builds
upon the _SQLite3Component_.

Therefore, in order to use _SQLite3JS_ in a JavaScript app, the
_SQLite3Component_ project `SQLite3Component\SQLite3Component.vcxproj` must be
added to the app's solution using _FILE > Add > Existing Project..._.
A reference to _SQLite3Component_ must be added to the app's project using
_PROJECT > Add Reference..._. Now, the _SQLite3JS_ source
`SQLite3JS\js\SQLite3.js` can be used in the app's project.

Note for users of Visual Studio 2012 Express: To compile the WinRT component
successfully, please install the [Windows SDK][1].

 [1]: http://msdn.microsoft.com/en-us/windows/desktop/hh852363.aspx


## Usage

The _SQLite3JS_ namespace provides an async JavaScript API for SQLite. It is built
around the `Database` object that can be obtained using `SQLite3JS.openAsync()`.
The API was inspired by [node-sqlite3][2].

 [2]: https://github.com/developmentseed/node-sqlite3/

### Example

    var dbPath = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite';
    SQLite3JS.openAsync(dbPath)
    .then(function (db) {
      return db.runAsync('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)')
      .then(function () {
        return db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Mango', 4.6, 123]);
      })
      .then(function () {
        return db.eachAsync('SELECT * FROM Item', function (row) {
          console.log('Get a ' + row.name + ' for $' + row.price);
        });
      })
      .then(function () {
        db.close();
      });
    });


## License

Copyright (c) 2012,2013 doo GmbH

Licensed under the MIT License, see LICENSE file.
