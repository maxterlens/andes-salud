define(["require", "exports", "../tslib", "./segment.model"], function (require, exports, tslib_1, segment_model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SubField = void 0;
    let SubField = /** @class */ (function (_super) {
        tslib_1.__extends(SubField, _super);
        function SubField(name, value) {
            if (name === void 0) {
                name = null;
            }
            if (value === void 0) {
                value = null;
            }
            return _super.call(this, name, value) || this;
        }
        return SubField;
    })(segment_model_1.Segment);
    exports.SubField = SubField;
});
