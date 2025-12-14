use std::io::{self, BufRead, Write};

pub struct CsvReader<R: BufRead> {
    reader: R,
    field: String,
    record: Vec<String>,
    in_quotes: bool,
    done: bool,
}

impl<R: BufRead> CsvReader<R> {
    pub fn new(reader: R) -> Self {
        Self {
            reader,
            field: String::new(),
            record: Vec::new(),
            in_quotes: false,
            done: false,
        }
    }
}

impl<R: BufRead> Iterator for CsvReader<R> {
    type Item = io::Result<Vec<String>>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }

        loop {
            let buf = match self.reader.fill_buf() {
                Ok(buf) => buf,
                Err(e) => return Some(Err(e)),
            };

            if buf.is_empty() {
                // EOF
                self.done = true;
                if !self.field.is_empty() || !self.record.is_empty() {
                    self.record.push(std::mem::take(&mut self.field));
                    return Some(Ok(std::mem::take(&mut self.record)));
                }
                return None;
            }

            let mut i = 0;
            while i < buf.len() {
                let c = buf[i] as char;

                match c {
                    '"' => {
                        if self.in_quotes {
                            if i + 1 < buf.len() && buf[i + 1] == b'"' {
                                self.field.push('"');
                                i += 1;
                            } else {
                                self.in_quotes = false;
                            }
                        } else {
                            self.in_quotes = true;
                        }
                    }

                    ',' if !self.in_quotes => {
                        self.record.push(std::mem::take(&mut self.field));
                    }

                    '\n' if !self.in_quotes => {
                        self.record.push(std::mem::take(&mut self.field));
                        self.reader.consume(i + 1);
                        return Some(Ok(std::mem::take(&mut self.record)));
                    }

                    '\r' => {}

                    _ => self.field.push(c),
                }

                i += 1;
            }

            self.reader.consume(i);
        }
    }
}

pub struct CsvWriter<W: Write> {
    writer: W,
}

impl<W: Write> CsvWriter<W> {
    pub fn new(writer: W) -> Self {
        Self { writer }
    }

    pub fn write_record(&mut self, record: &[String]) -> io::Result<()> {
        let mut first = true;
        for field in record {
            if !first {
                write!(self.writer, ",")?;
            } else {
                first = false;
            }

            // Escape and quote if needed
            let needs_quotes = field.contains(',') || field.contains('"') || field.contains('\n');
            if needs_quotes {
                write!(self.writer, "\"")?;
                for c in field.chars() {
                    if c == '"' {
                        write!(self.writer, "\"\"")?;
                    } else {
                        write!(self.writer, "{}", c)?;
                    }
                }
                write!(self.writer, "\"")?;
            } else {
                write!(self.writer, "{}", field)?;
            }
        }
        writeln!(self.writer)?;
        Ok(())
    }
}
