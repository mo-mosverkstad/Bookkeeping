use std::fmt;

/// Dynamic value container that supports a small set of primitive types.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i32),
    Float(f32),
    Double(f64),
    UInt(u32),
    Long(i64),
    Bool(bool),
    Byte(u8),
    Char(char),
    Str(String),
    Date(u64),
    Null,
}

/// Enumerates the underlying type stored in a [`Value`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    Int,
    Float,
    Double,
    UInt,
    Long,
    Bool,
    Byte,
    Char,
    Str,
    Date,
    Null,
}

impl Value {
    /// Returns the [`ValueKind`] describing the contained value.
    pub fn kind(&self) -> ValueKind {
        match self {
            Value::Int(_) => ValueKind::Int,
            Value::Float(_) => ValueKind::Float,
            Value::Double(_) => ValueKind::Double,
            Value::UInt(_) => ValueKind::UInt,
            Value::Long(_) => ValueKind::Long,
            Value::Bool(_) => ValueKind::Bool,
            Value::Byte(_) => ValueKind::Byte,
            Value::Char(_) => ValueKind::Char,
            Value::Str(_) => ValueKind::Str,
            Value::Date(_) => ValueKind::Date,
            Value::Null => ValueKind::Null,
        }
    }

    /// Returns a human readable label for the contained value.
    pub fn type_name(&self) -> &'static str {
        self.kind().as_str()
    }
}

impl ValueKind {
    /// Returns a lower-case name for the kind.
    pub fn as_str(self) -> &'static str {
        match self {
            ValueKind::Int => "int",
            ValueKind::Float => "float",
            ValueKind::Double => "double",
            ValueKind::UInt => "uint",
            ValueKind::Long => "long",
            ValueKind::Bool => "bool",
            ValueKind::Byte => "byte",
            ValueKind::Char => "char",
            ValueKind::Str => "str",
            ValueKind::Date => "date",
            ValueKind::Null => "null",
        }
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Int(v) => write!(f, "{}", v),
            Value::Float(v) => write!(f, "{:.2}", v),
            Value::Double(v) => write!(f, "{:.4}", v),
            Value::UInt(v) => write!(f, "{}", v),
            Value::Long(v) => write!(f, "{}", v),
            Value::Bool(v) => write!(f, "{}", v),
            Value::Byte(v) => write!(f, "{}", v),
            Value::Char(v) => write!(f, "{}", v),
            Value::Str(v) => write!(f, "{}", v),
            Value::Date(v) => write!(f, "{}", v),
            Value::Null => write!(f, "null"),
        }
    }
}

macro_rules! impl_from {
    ($variant:ident, $ty:ty) => {
        impl From<$ty> for Value {
            fn from(value: $ty) -> Self {
                Value::$variant(value.into())
            }
        }
    };
}

impl_from!(Int, i32);
impl_from!(Float, f32);
impl_from!(Double, f64);
impl_from!(UInt, u32);
impl_from!(Long, i64);
impl_from!(Bool, bool);
impl_from!(Byte, u8);
impl_from!(Char, char);
impl_from!(Date, u64);

impl From<&str> for Value {
    fn from(value: &str) -> Self {
        Value::Str(value.to_string())
    }
}

impl From<String> for Value {
    fn from(value: String) -> Self {
        Value::Str(value)
    }
}

macro_rules! impl_try_from_value {
    ($ty:ty, $variant:ident) => {
        impl TryFrom<Value> for $ty {
            type Error = Value;

            fn try_from(value: Value) -> Result<Self, Self::Error> {
                if let Value::$variant(inner) = value {
                    Ok(inner.into())
                } else {
                    Err(value)
                }
            }
        }
    };
}

impl_try_from_value!(i32, Int);
impl_try_from_value!(f32, Float);
impl_try_from_value!(f64, Double);
impl_try_from_value!(u32, UInt);
impl_try_from_value!(i64, Long);
impl_try_from_value!(bool, Bool);
impl_try_from_value!(u8, Byte);
impl_try_from_value!(char, Char);
impl_try_from_value!(String, Str);
impl_try_from_value!(u64, Date);
