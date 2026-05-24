import { renderMath } from "../math/render.ts";
import type {
    ChemistryProgram, ChemStatement,
    ReactionNode, ReactionTerm, SpeciesNode,
    CompoundNode, ChargedSpeciesNode, ParticleNode,
    GroupNode, ElementGroup, ParenGroup, BracketGroup,
    ThermoNode, AtomDeclNode, BondDeclNode, GroupDeclNode,
    ConditionNode,
} from "./types.ts";

// ── HTML helpers ──────────────────────────────────────────────────────────────

function el(tag: string, cls?: string): HTMLElement {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}

function text(s: string): Text { return document.createTextNode(s); }

function sub(s: string): HTMLElement {
    const e = document.createElement("sub");
    e.textContent = s;
    return e;
}

function sup(s: string): HTMLElement {
    const e = document.createElement("sup");
    e.textContent = s;
    return e;
}

// ── Group rendering ───────────────────────────────────────────────────────────

function renderGroups(groups: GroupNode[], container: HTMLElement): void {
    for (const g of groups) {
        if (g.type === "ElementGroup") {
            const eg = g as ElementGroup;
            // Isotope: stacked mass/atomic as leading super/sub
            if (eg.isotope) {
                const wrap = el("span", "chem-isotope");
                const scripts = el("span", "chem-isotope-scripts");
                scripts.appendChild(sup(String(eg.isotope.mass)));
                if (eg.isotope.atomic !== undefined)
                    scripts.appendChild(sub(String(eg.isotope.atomic)));
                wrap.appendChild(scripts);
                container.appendChild(wrap);
            }
            container.appendChild(text(eg.symbol));
            if (eg.count > 1) container.appendChild(sub(String(eg.count)));
        } else if (g.type === "ParenGroup") {
            const pg = g as ParenGroup;
            container.appendChild(text("("));
            renderGroups(pg.inner, container);
            container.appendChild(text(")"));
            if (pg.count > 1) container.appendChild(sub(String(pg.count)));
        } else {
            const bg = g as BracketGroup;
            container.appendChild(text("["));
            renderGroups(bg.inner, container);
            container.appendChild(text("]"));
            if (bg.count > 1) container.appendChild(sub(String(bg.count)));
        }
    }
}

// ── Species rendering ─────────────────────────────────────────────────────────

const PARTICLE_SYMBOLS: Record<string, string> = {
    "n": "n", "p": "p", "e-": "e⁻", "e+": "e⁺",
    "alpha": "α", "beta-": "β⁻", "beta+": "β⁺", "gamma": "γ",
};

const STATE_LABELS: Record<string, string> = {
    "s": "(s)", "l": "(l)", "g": "(g)", "aq": "(aq)",
};

function renderSpecies(species: SpeciesNode): HTMLElement {
    const wrap = el("span", "chem-species");

    if (species.type === "Particle") {
        const p = species as ParticleNode;
        wrap.appendChild(text(PARTICLE_SYMBOLS[p.kind] ?? p.kind));
        return wrap;
    }

    if (species.type === "ChargedSpecies") {
        const cs = species as ChargedSpeciesNode;
        renderGroups(cs.compound.groups, wrap);
        // Charge as superscript: 2+, -, 3-, etc.
        const chargeStr = (cs.charge.magnitude === 1 ? "" : String(cs.charge.magnitude)) + cs.charge.sign;
        wrap.appendChild(sup(chargeStr));
        const stateKey = cs.state ?? cs.compound.state;
        if (stateKey) {
            const stateEl = el("span", "chem-state");
            stateEl.textContent = STATE_LABELS[stateKey];
            wrap.appendChild(stateEl);
        }
        return wrap;
    }

    // CompoundNode
    const compound = species as CompoundNode;
    renderGroups(compound.groups, wrap);
    if (compound.state) {
        const stateEl = el("span", "chem-state");
        stateEl.textContent = STATE_LABELS[compound.state];
        wrap.appendChild(stateEl);
    }
    return wrap;
}

// ── Reaction term ─────────────────────────────────────────────────────────────

function renderTerm(term: ReactionTerm): HTMLElement {
    const wrap = el("span", "chem-term");
    if (term.coeff > 1) {
        const coeffEl = el("span", "chem-coeff");
        coeffEl.textContent = String(term.coeff);
        wrap.appendChild(coeffEl);
    }
    wrap.appendChild(renderSpecies(term.species));
    return wrap;
}

// ── Arrow ─────────────────────────────────────────────────────────────────────

const ARROW_SYMBOLS: Record<string, string> = {
    "->": "→", "<->": "⇌", "<=>": "⇌", "-->": "⟶",
};

// ── Conditions ────────────────────────────────────────────────────────────────

function renderConditions(cond: ConditionNode): HTMLElement {
    const wrap = el("span", "chem-conditions");
    const parts: string[] = [];
    for (const item of cond.items) {
        if (item.value) {
            const valEl = renderMath(item.value);
            parts.push(item.key + "=");
            wrap.appendChild(text(parts.pop()!));
            wrap.appendChild(valEl);
        } else {
            wrap.appendChild(text(item.key));
        }
        wrap.appendChild(text(", "));
    }
    // Remove trailing ", "
    if (wrap.lastChild && wrap.lastChild.textContent === ", ")
        wrap.removeChild(wrap.lastChild);
    return wrap;
}

// ── Reaction rendering ────────────────────────────────────────────────────────

function renderReaction(node: ReactionNode): HTMLElement {
    const wrap = el("div", "chem-reaction");

    // LHS
    const lhsEl = el("span", "chem-side");
    node.lhs.forEach((term, i) => {
        if (i > 0) lhsEl.appendChild(text(" + "));
        lhsEl.appendChild(renderTerm(term));
    });
    wrap.appendChild(lhsEl);

    // Arrow with optional conditions above
    const arrowWrap = el("span", "chem-arrow-wrap");
    if (node.conditions) {
        const condEl = renderConditions(node.conditions);
        arrowWrap.appendChild(condEl);
    }
    const arrowEl = el("span", "chem-arrow");
    arrowEl.textContent = ARROW_SYMBOLS[node.arrow] ?? node.arrow;
    arrowWrap.appendChild(arrowEl);
    wrap.appendChild(arrowWrap);

    // RHS
    const rhsEl = el("span", "chem-side");
    node.rhs.forEach((term, i) => {
        if (i > 0) rhsEl.appendChild(text(" + "));
        rhsEl.appendChild(renderTerm(term));
    });
    wrap.appendChild(rhsEl);

    return wrap;
}

// ── Thermo rendering ──────────────────────────────────────────────────────────

const THERMO_DISPLAY: Record<string, string> = {
    "DeltaH": "ΔH", "DeltaG": "ΔG", "DeltaS": "ΔS",
    "Ka": "Ka", "Ksp": "Ksp", "Ea": "Ea", "Kb": "Kb", "Kw": "Kw",
};

function renderThermo(node: ThermoNode): HTMLElement {
    const wrap = el("div", "chem-thermo");
    wrap.appendChild(text(THERMO_DISPLAY[node.key] ?? node.key));
    wrap.appendChild(text(" = "));
    wrap.appendChild(renderMath(node.value));
    return wrap;
}

// ── Structural formula rendering ──────────────────────────────────────────────

function renderStructural(statements: ChemStatement[]): HTMLElement {
    const wrap = el("div", "chem-structural");
    for (const s of statements) {
        const row = el("div", "chem-struct-row");
        if (s.type === "AtomDecl") {
            row.textContent = `Atom: ${(s as AtomDeclNode).label}`;
        } else if (s.type === "BondDecl") {
            const b = s as BondDeclNode;
            row.textContent = `${b.atom1} — ${b.atom2} (${b.bondType})`;
        } else if (s.type === "GroupDecl") {
            const g = s as GroupDeclNode;
            row.textContent = `${g.atom}: ${g.group}`;
        }
        wrap.appendChild(row);
    }
    return wrap;
}

// ── Top-level renderer ────────────────────────────────────────────────────────

export function renderChemistry(program: ChemistryProgram): HTMLElement {
    const container = el("div", "chem-program");

    // Separate structural statements from reactions/thermo
    const structStatements = program.statements.filter(
        s => s.type === "AtomDecl" || s.type === "BondDecl" || s.type === "GroupDecl"
    );
    const otherStatements = program.statements.filter(
        s => s.type !== "AtomDecl" && s.type !== "BondDecl" && s.type !== "GroupDecl"
    );

    for (const stmt of otherStatements) {
        if (stmt.type === "Reaction") {
            container.appendChild(renderReaction(stmt as ReactionNode));
        } else if (stmt.type === "Thermo") {
            container.appendChild(renderThermo(stmt as ThermoNode));
        }
    }

    if (structStatements.length > 0) {
        container.appendChild(renderStructural(structStatements));
    }

    return container;
}
