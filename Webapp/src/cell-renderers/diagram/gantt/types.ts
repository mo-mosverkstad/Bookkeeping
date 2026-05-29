export interface GanttAST { title: string; dateFormat: string; sections: GanttSection[]; }
export interface GanttSection { name: string; tasks: GanttTask[]; }
export interface GanttTask { name: string; id: string; start: string; duration: string; }
