export class TypedValue {
    value: string;
    readonly typeId: string;
    constructor(value: string, typeId: string) {
        this.value = value;
        this.typeId = typeId;
    }
}
