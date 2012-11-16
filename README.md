# SQLite3-WinRT

Async SQLite for (JavaScript) Windows Store apps.

## Status

Please note that _SQLite3-WinRT_ is currently in beta stage. The API covers the
better part of every day use cases, but might still be missing some
functionality or even change slightly in the future. However, it is already
being used by certified apps published in the Windows Store. Feedback and
contributions are highly appreciated, feel free to open issues or pull requests
on GitHub.

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
        return db.runAsync('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
      })
      .then(function (db) {
        return db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Mango', 4.6, 123]);
      })
      .then(function (db) {
        return db.eachAsync('SELECT * FROM Item', function (row) {
          console.log('Get a ' + row.name + ' for $' + row.price);
        });
      })
      .then(function (db) {
        db.close();
      });

## License

Copyright (c) 2012 doo GmbH

Licensed under the MIT License, see LICENSE file.
