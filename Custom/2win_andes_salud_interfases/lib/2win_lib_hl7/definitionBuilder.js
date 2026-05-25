define(["require", "exports", "./data/fieldDefinitions"], function (require, exports, fieldDefinitions_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DefinitionBuilder = void 0;
    let DefinitionBuilder = /** @class */ (function () {
        class DefinitionBuilder {
            constructor() {}
            /** Adds field definition (Description, length) to every field of the hl7 message*/
            addDefinitionToHl7Message(hl7Message) {
                if (!hl7Message || !hl7Message.children) throw new Error("hl7Message is not provided or incorrect hl7Message is provided");
                this.addDefinition(hl7Message.children);
            }
            addDefinition(children) {
                if (!children) return;
                for (let i = 0; i < children.length; i++) {
                    if (!children[i]) continue;
                    let hl7FieldName = children[i].name;
                    children[i].definition = fieldDefinitions_1.FieldDefinitions.getFieldDefinition(hl7FieldName);
                    this.addDefinition(children[i].children);
                }
            }
        }
        return DefinitionBuilder;
    })();
    exports.DefinitionBuilder = DefinitionBuilder;
});
