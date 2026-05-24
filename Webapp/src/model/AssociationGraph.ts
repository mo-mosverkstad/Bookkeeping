import { Association } from "./Association.ts";
import type { RelationType } from "./RelationType.ts";

export class AssociationGraph {
    private edges: Association[] = [];
    private vocabulary: RelationType[] = [];

    setVocabulary(vocab: RelationType[] | { relations: RelationType[] }): void {
        this.vocabulary = Array.isArray(vocab) ? vocab : vocab.relations;
    }

    getVocabulary(): RelationType[] { return this.vocabulary; }

    addAssociation(source: string, relation: string, target: string): void {
        this.edges.push(new Association(source, relation, target));
    }

    addFromColumn(entityIds: string[], associationValues: string[]): void {
        for (let i = 0; i < entityIds.length; i++) {
            const value = associationValues[i];
            if (!value) continue;
            for (const entry of value.split(";").map(s => s.trim()).filter(Boolean)) {
                const colonIdx = entry.indexOf(":");
                if (colonIdx === -1) continue;
                this.addAssociation(entityIds[i], entry.slice(0, colonIdx).trim(), entry.slice(colonIdx + 1).trim());
            }
        }
    }

    addAssociations(entityIds: string[], associationValues: string[]): void {
        this.addFromColumn(entityIds, associationValues);
    }

    getAllEdges(): Association[] { return this.edges; }

    filterByRelation(relation: string, target: string): string[] {
        return this.edges.filter(e => e.relation === relation && e.target === target).map(e => e.source);
    }

    filterBySource(relation: string, source: string): string[] {
        return this.edges.filter(e => e.relation === relation && e.source === source).map(e => e.target);
    }

    getAssociationsFor(entityId: string): { outgoing: Association[]; incoming: Association[] } {
        return {
            outgoing: this.edges.filter(e => e.source === entityId),
            incoming: this.edges.filter(e => e.target === entityId),
        };
    }

    getInverse(relation: string): string | null {
        const rel = this.vocabulary.find(r => r.name === relation);
        if (rel) return rel.inverse;
        const inv = this.vocabulary.find(r => r.inverse === relation);
        if (inv) return inv.name;
        return null;
    }

    getRelationTypes(): string[] { return [...new Set(this.edges.map(e => e.relation))]; }
    getAllEntityIds(): string[] {
        const s = new Set<string>();
        for (const e of this.edges) { s.add(e.source); s.add(e.target); }
        return [...s];
    }
    clear(): void { this.edges = []; }
}
