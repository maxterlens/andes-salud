define([], function () {
    let extendStatics =
        Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array &&
            function (d, b) {
                d.__proto__ = b;
            }) ||
        function (d, b) {
            for (let p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
        };

    const __extends = function (d, b) {
        if (typeof b !== "function" && b !== null) throw new TypeError(`Class extends value ${String(b)} is not a constructor or null`);
        extendStatics(d, b);
        function __() {
            this.constructor = d;
        }
        d.prototype = b === null ? Object.create(b) : ((__.prototype = b.prototype), new __());
    };
    return { __extends };
});
