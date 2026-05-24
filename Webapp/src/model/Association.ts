export class Association {
    readonly source: string;
    readonly relation: string;
    readonly target: string;
    constructor(source: string, relation: string, target: string) {
        this.source = source;
        this.relation = relation;
        this.target = target;
    }
}
