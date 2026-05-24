export class RelationType {
    readonly name: string;
    readonly inverse: string;
    readonly symmetric: boolean;
    constructor(name: string, inverse: string, symmetric: boolean) {
        this.name = name;
        this.inverse = inverse;
        this.symmetric = symmetric;
    }
}
