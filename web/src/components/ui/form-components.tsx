import { Control, FieldValues, Path } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
  disabled?: boolean;
}

// crio um input de texto simples
export function TextInput<T extends FieldValues>({ control, name, label, disabled }: BaseProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value || ""} disabled={disabled} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// crio um input que força o valor pra numero
export function NumberInput<T extends FieldValues>({ control, name, label }: BaseProps<T>) {
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
              {...field} 
              onChange={(e) => field.onChange(e.target.valueAsNumber)}
              value={field.value || ""} 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface SelectProps<T extends FieldValues> extends BaseProps<T> {
  options: string[];
}

// crio o select usando o componente nativo do shadcn
export function SelectInput<T extends FieldValues>({ control, name, label, options }: SelectProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value || ""}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface RadioProps<T extends FieldValues> extends BaseProps<T> {
  options: string[];
}

// crio o grupo de radio buttons
export function RadioInput<T extends FieldValues>({ control, name, label, options }: RadioProps<T>) {
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
            >
              {options.map((opt) => (
                <FormItem key={opt} className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value={opt} />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    {opt}
                  </FormLabel>
                </FormItem>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface CheckboxGroupProps<T extends FieldValues> extends BaseProps<T> {
  options: string[];
}

// crio o grupo de checkboxes lidando com array de strings
export function CheckboxGroup<T extends FieldValues>({ control, name, label, options }: CheckboxGroupProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <div className="mb-4">
            <FormLabel>{label}</FormLabel>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {options.map((opt) => (
              <FormField
                key={opt}
                control={control}
                name={name}
                render={({ field }) => {
                  return (
                    <FormItem
                      key={opt}
                      className="flex flex-row items-start space-x-3 space-y-0"
                    >
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(opt)}
                          onCheckedChange={(checked: boolean | "indeterminate") => {
                            return checked === true
                              ? field.onChange([...(field.value || []), opt])
                              : field.onChange(
                                  field.value?.filter(
                                    (value: string) => value !== opt
                                  )
                                );
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        {opt}
                      </FormLabel>
                    </FormItem>
                  );
                }}
              />
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// crio o textarea pra observações
export function TextAreaInput<T extends FieldValues>({ control, name, label }: BaseProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              className="resize-none"
              {...field}
              value={field.value || ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}