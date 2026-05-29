flowchart LR
    Input[User Input] --> Validate{Valid?}
    Validate --> Process[[Process Data]]
    Validate --> Error((Error))
    Error --> Input
    Process --> Store[Database]
    Store --> Output([Response])
