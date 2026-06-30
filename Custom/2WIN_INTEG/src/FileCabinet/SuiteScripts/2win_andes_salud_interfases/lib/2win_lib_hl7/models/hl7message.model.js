define(["require", "exports", "../tslib", "./segment.model"], function (require, exports, tslib_1, segment_model_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Hl7Message = void 0;
    let Hl7Message = /** @class */ (function (_super) {
        tslib_1.__extends(Hl7Message, _super);
        function Hl7Message() {
            return (_super !== null && _super.apply(this, arguments)) || this;
        }
        /**Returns field element by its name i.e. (MSH-1) */
        Hl7Message.prototype.getElementByName = function (fieldName) {
            let segment = this.findSegmentByName(fieldName, this.children); //Find segment to not iterate over every field in wrong segment
            if (!segment) return;
            let el = this.findElementByName(fieldName, segment.children); //find element on the segment's children
            return el;
        };
        Hl7Message.prototype.findElementByName = function (fieldName, children) {
            if (!children) return;
            for (let i = 0; i < children.length; i++) {
                let name_1 = children[i].name;
                if (fieldName == name_1) return children[i];
                let el = this.findElementByName(fieldName, children[i].children);
                if (el) {
                    return el;
                }
            }
        };
        Hl7Message.prototype.findSegmentByName = function (fieldName, children) {
            if (!this.children) return;
            for (let i = 0; i < children.length; i++) {
                if (fieldName.includes(children[i].name)) {
                    return this;
                }
            }
        };
        return Hl7Message;
    })(segment_model_1.Segment);
    exports.Hl7Message = Hl7Message;
});
