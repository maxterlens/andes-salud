define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FieldDefinition = void 0;
    let FieldDefinition = /** @class */ (function () {
        function FieldDefinition(description, length) {
            if (length === void 0) {
                length = null;
            }
            this.description = description;
            this.length = length;
        }
        return FieldDefinition;
    })();
    exports.FieldDefinition = FieldDefinition;
});
