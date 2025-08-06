package Bookkeeping.Tables;

import java.util.Date;

public enum CollationTypes {
    BOOLEAN {
        @Override
        public boolean validate(Object object) {
            return object instanceof Boolean;
        }
    },
    INTEGER {
        @Override
        public boolean validate(Object object) {
            return object instanceof Integer;
        }
    },
    STRING {
        @Override
        public boolean validate(Object object) {
            return object instanceof String;
        }
    },
    DATE {
        @Override
        public boolean validate(Object object) {
            return object instanceof Date;
        }
    };

    public abstract boolean validate(Object object);
}