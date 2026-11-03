// Hand-written to match supabase/schema.sql in the same format `supabase gen types typescript`
// produces. Replace it with the real thing whenever the schema changes:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Relationships: [];
      };
      timesheet_weeks: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          status: Database["public"]["Enums"]["week_status"];
          submitted_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          admin_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          status?: Database["public"]["Enums"]["week_status"];
          submitted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          admin_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          status?: Database["public"]["Enums"]["week_status"];
          submitted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          admin_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timesheet_weeks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timesheet_weeks_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      timesheet_rows: {
        Row: {
          id: string;
          week_id: string;
          project: string;
          position: number;
          mon: number;
          tue: number;
          wed: number;
          thu: number;
          fri: number;
          sat: number;
          sun: number;
        };
        Insert: {
          id?: string;
          week_id: string;
          project?: string;
          position?: number;
          mon?: number;
          tue?: number;
          wed?: number;
          thu?: number;
          fri?: number;
          sat?: number;
          sun?: number;
        };
        Update: {
          id?: string;
          week_id?: string;
          project?: string;
          position?: number;
          mon?: number;
          tue?: number;
          wed?: number;
          thu?: number;
          fri?: number;
          sat?: number;
          sun?: number;
        };
        Relationships: [
          {
            foreignKeyName: "timesheet_rows_week_id_fkey";
            columns: ["week_id"];
            isOneToOne: false;
            referencedRelation: "timesheet_weeks";
            referencedColumns: ["id"];
          },
        ];
      };
      requests: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["request_type"];
          from_date: string;
          to_date: string;
          reason: string | null;
          status: Database["public"]["Enums"]["request_status"];
          reviewed_by: string | null;
          reviewed_at: string | null;
          admin_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["request_type"];
          from_date: string;
          to_date: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          admin_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Database["public"]["Enums"]["request_type"];
          from_date?: string;
          to_date?: string;
          reason?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          admin_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      work_logs: {
        Row: {
          id: string;
          user_id: string;
          log_date: string;
          content: string;
          hours: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          log_date: string;
          content: string;
          hours?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          log_date?: string;
          content?: string;
          hours?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
      portal_today: { Args: never; Returns: string };
      set_user_role: {
        Args: { target: string; new_role: Database["public"]["Enums"]["user_role"] };
        Returns: undefined;
      };
      week_is_open: { Args: { w: string }; Returns: boolean };
    };
    Enums: {
      request_status: "pending" | "approved" | "rejected" | "cancelled";
      request_type: "leave" | "wfh";
      user_role: "employee" | "admin";
      week_status: "draft" | "submitted" | "approved" | "sent_back";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
