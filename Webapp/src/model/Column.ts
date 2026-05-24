export class Column {
    readonly name: string;
    readonly typeId: string;
    constructor(name: string, typeId: string) {
        this.name = name;
        this.typeId = typeId;
    }
}
