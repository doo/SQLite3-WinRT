(function () {

  String.prototype.toUri = function () {
    return new Windows.Foundation.Uri(this);
  }

  String.prototype.toAppPackageUri = function () {
    return ("ms-appx:///" + this).toUri();
  }

}());