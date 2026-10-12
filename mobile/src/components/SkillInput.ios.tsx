import { useState } from "react";
import { requireNativeView } from "expo";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import type { SkillInputProps } from "./SkillInput";
const NativeInput = requireNativeView<
  ViewProps & {
    value: string;
    skills: string[];
    editable: boolean;
    eventCount: number;
    caret: number;
    onChange: (
      event: NativeSyntheticEvent<{
        text: string;
        caret: number;
        eventCount: number;
      }>,
    ) => void;
    onSelection: (event: NativeSyntheticEvent<{ caret: number }>) => void;
    onMeasure: (event: NativeSyntheticEvent<{ height: number }>) => void;
  }
>("ZotigoSkillInput");
export function SkillInput({
  value,
  skills,
  editable,
  caret,
  onChange,
  onCaret,
}: SkillInputProps) {
  const [height, setHeight] = useState(44);
  const [eventCount, setEventCount] = useState(0);
  return (
    <NativeInput
      value={value}
      skills={skills}
      editable={editable}
      caret={caret}
      eventCount={eventCount}
      style={{ height, flex: 1 }}
      onChange={(event) => {
        setEventCount(event.nativeEvent.eventCount);
        onChange(event.nativeEvent.text);
        onCaret(event.nativeEvent.caret);
      }}
      onSelection={(event) => onCaret(event.nativeEvent.caret)}
      onMeasure={(event) => setHeight(event.nativeEvent.height)}
    />
  );
}
