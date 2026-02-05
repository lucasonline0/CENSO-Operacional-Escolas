"use client";

import { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
}

// Interface estendida para suportar atributos numéricos
interface NumberProps<T extends FieldValues> extends BaseProps<T> {
  min?: number;
  max?: number;
  step?: number;
}

interface SelectProps<T extends FieldValues> extends BaseProps<T> {
  options: string[];
}

interface RadioProps<T extends FieldValues> extends BaseProps<T> {
  options: string[];
}

export function TextInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  disabled,
}: BaseProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input 
              placeholder={placeholder} 
              {...field} 
              value={field.value || ""} 
              disabled={disabled}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function NumberInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  disabled,
  min, // Recebendo min
  max, // Recebendo max
  step, // Recebendo step
}: NumberProps<T>) { // Usando a nova interface
  
  const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) => 
    ["e", "E", "+", "-"].includes(e.key) && e.preventDefault();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              min={min ?? 0} // Usa o min passado ou 0 por padrão
              max={max}
              step={step}
              onKeyDown={blockInvalidChar} 
              placeholder={placeholder}
              {...field}
              onFocus={(e) => {
                if (field.value === 0) {
                    field.onChange("");
                }
              }}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                // Permite limpar o campo (NaN) ou valores válidos
                if (isNaN(val)) {
                   field.onChange("");
                   return;
                }
                if (val < 0) return; 
                field.onChange(val);
              }}
              value={field.value ?? ""}
              disabled={disabled}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectInput<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Selecione...",
  description,
  disabled,
}: SelectProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select 
            onValueChange={field.onChange} 
            value={field.value || ""} 
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function RadioInput<T extends FieldValues>({
  control,
  name,
  label,
  options,
  description,
  disabled,
}: RadioProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-3">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              defaultValue={field.value}
              className="flex flex-col space-y-1"
              disabled={disabled}
            >
              {options.map((option) => (
                <FormItem
                  key={option}
                  className="flex items-center space-x-3 space-y-0"
                >
                  <FormControl>
                    <RadioGroupItem value={option} />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    {option}
                  </FormLabel>
                </FormItem>
              ))}
            </RadioGroup>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}