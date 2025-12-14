pub trait TargetMementoTrait<T>{
    fn apply_memento(self: &mut Self, memento: &T) -> T;
}

#[derive(Debug, Default)]
pub struct History<T: Clone>{
    undo_stack: Vec<T>,
    redo_stack: Vec<T>
}

#[allow(unused_assignments)]
impl <T: Clone> History<T>{
    pub fn new() -> Self {
        Self { undo_stack: Vec::new(), redo_stack: Vec::new() }
    }

    pub fn record(self: &mut Self, memento: T){
        self.undo_stack.push(memento);
        self.redo_stack.clear();
    }

    pub fn undoable(self: &mut Self) -> bool {
        self.undo_stack.len() != 0
    }

    pub fn redoable(self: &mut Self) -> bool {
        self.redo_stack.len() != 0
    }

    pub fn undo<U: TargetMementoTrait<T>>(self: &mut Self, target: &mut U){
        if let Some(memento) = self.undo_stack.pop(){
            let inverse = target.apply_memento(&memento);
            self.redo_stack.push(inverse);
        }
    }

    pub fn redo<U: TargetMementoTrait<T>>(self: &mut Self, target: &mut U){
        if let Some(memento) = self.redo_stack.pop(){
            let inverse = target.apply_memento(&memento);
            self.undo_stack.push(inverse);
        }
    }
    
    pub fn clear(self: &mut Self){
        self.undo_stack.clear();
        self.redo_stack.clear();
    }
}