// Hand-written to match supabase/schema.sql in the same format `supabase gen types typescript`
// produces. Replace it with the real thing whenever the schema changes:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > lib/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      allowed_emails: {
        Row: { email: string; added_by: string | null; created_at: string };
        Insert: { email: string; added_by?: string | null; created_at?: string };
        Update: { email?: string; added_by?: string | null; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "allowed_emails_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_details: {
        Row: {
          user_id: string;
          joined_on: string;
          left_on: string | null;
          department: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          joined_on: string;
          left_on?: string | null;
          department?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          joined_on?: string;
          left_on?: string | null;
          department?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_details_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      salary_structures: {
        Row: {
          id: string;
          user_id: string;
          effective_from: string;
          basic_paise: number;
          hra_paise: number;
          allowances_paise: number;
          deductions_paise: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          effective_from: string;
          basic_paise: number;
          hra_paise?: number;
          allowances_paise?: number;
          deductions_paise?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          effective_from?: string;
          basic_paise?: number;
          hra_paise?: number;
          allowances_paise?: number;
          deductions_paise?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salary_structures_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_settings: {
        Row: {
          id: boolean;
          currency: string;
          cycle_start_day: number;
          pay_basis: string;
          weekly_off_days: number[];
          holiday_work_mode: string;
          overtime_enabled: boolean;
          overtime_rate_bp: number;
          holiday_work_rate_bp: number;
          standard_hours_per_day: number;
          overtime_base: string;
          paid_leave_per_month: number;
          round_net_to_rupee: boolean;
          show_structure_to_employees: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          currency?: string;
          cycle_start_day?: number;
          pay_basis?: string;
          weekly_off_days?: number[];
          holiday_work_mode?: string;
          overtime_enabled?: boolean;
          overtime_rate_bp?: number;
          holiday_work_rate_bp?: number;
          standard_hours_per_day?: number;
          overtime_base?: string;
          paid_leave_per_month?: number;
          round_net_to_rupee?: boolean;
          show_structure_to_employees?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          currency?: string;
          cycle_start_day?: number;
          pay_basis?: string;
          weekly_off_days?: number[];
          holiday_work_mode?: string;
          overtime_enabled?: boolean;
          overtime_rate_bp?: number;
          holiday_work_rate_bp?: number;
          standard_hours_per_day?: number;
          overtime_base?: string;
          paid_leave_per_month?: number;
          round_net_to_rupee?: boolean;
          show_structure_to_employees?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_components: {
        Row: {
          id: string;
          code: string;
          name: string;
          kind: string;
          calc: string;
          amount_paise: number;
          percent_bp: number;
          percent_of: string;
          enabled: boolean;
          statutory: boolean;
          sort_order: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          kind: string;
          calc: string;
          amount_paise?: number;
          percent_bp?: number;
          percent_of?: string;
          enabled?: boolean;
          statutory?: boolean;
          sort_order?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          kind?: string;
          calc?: string;
          amount_paise?: number;
          percent_bp?: number;
          percent_of?: string;
          enabled?: boolean;
          statutory?: boolean;
          sort_order?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payroll_audit: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          detail?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          detail?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_audit_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_runs: {
        Row: {
          id: string;
          period_start: string;
          period_end: string;
          status: string;
          created_by: string | null;
          created_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          finalized_by: string | null;
          finalized_at: string | null;
          paid_on: string | null;
          reopen_count: number;
        };
        Insert: {
          id?: string;
          period_start: string;
          period_end: string;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          finalized_by?: string | null;
          finalized_at?: string | null;
          paid_on?: string | null;
          reopen_count?: number;
        };
        Update: {
          id?: string;
          period_start?: string;
          period_end?: string;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          finalized_by?: string | null;
          finalized_at?: string | null;
          paid_on?: string | null;
          reopen_count?: number;
        };
        Relationships: [];
      };
      payroll_run_inputs: {
        Row: {
          run_id: string;
          user_id: string;
          manual_lop_days: number;
          note: string | null;
        };
        Insert: {
          run_id: string;
          user_id: string;
          manual_lop_days?: number;
          note?: string | null;
        };
        Update: {
          run_id?: string;
          user_id?: string;
          manual_lop_days?: number;
          note?: string | null;
        };
        Relationships: [{
            foreignKeyName: "payroll_run_inputs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }];
      };
      payroll_adjustments: {
        Row: {
          id: string;
          run_id: string;
          user_id: string;
          kind: string;
          label: string;
          amount_paise: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          user_id: string;
          kind: string;
          label: string;
          amount_paise: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          user_id?: string;
          kind?: string;
          label?: string;
          amount_paise?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [{
            foreignKeyName: "payroll_adjustments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }];
      };
      payslips: {
        Row: {
          id: string;
          run_id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          status: string;
          paid_on: string | null;
          gross_paise: number;
          deductions_paise: number;
          net_paise: number;
          payable_days: number;
          lop_days: number;
          currency: string;
          snapshot: Json;
          superseded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          status?: string;
          paid_on?: string | null;
          gross_paise: number;
          deductions_paise: number;
          net_paise: number;
          payable_days: number;
          lop_days: number;
          currency: string;
          snapshot: Json;
          superseded_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          user_id?: string;
          period_start?: string;
          period_end?: string;
          status?: string;
          paid_on?: string | null;
          gross_paise?: number;
          deductions_paise?: number;
          net_paise?: number;
          payable_days?: number;
          lop_days?: number;
          currency?: string;
          snapshot?: Json;
          superseded_at?: string | null;
          created_at?: string;
        };
        Relationships: [{
            foreignKeyName: "payslips_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }, {
            foreignKeyName: "payslips_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "payroll_runs";
            referencedColumns: ["id"];
          }];
      };
      payroll_queries: {
        Row: {
          id: string;
          user_id: string;
          payslip_id: string;
          topic: string;
          message: string;
          status: string;
          admin_reply: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          payslip_id: string;
          topic: string;
          message: string;
          status?: string;
          admin_reply?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          payslip_id?: string;
          topic?: string;
          message?: string;
          status?: string;
          admin_reply?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [{
            foreignKeyName: "payroll_queries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }, {
            foreignKeyName: "payroll_queries_payslip_id_fkey";
            columns: ["payslip_id"];
            isOneToOne: false;
            referencedRelation: "payslips";
            referencedColumns: ["id"];
          }];
      };
      comp_off_settings: {
        Row: {
          id: boolean;
          half_day_hours: number;
          full_day_hours: number;
          expiry_days: number;
          monthly_cap: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          half_day_hours?: number;
          full_day_hours?: number;
          expiry_days?: number;
          monthly_cap?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          half_day_hours?: number;
          full_day_hours?: number;
          expiry_days?: number;
          monthly_cap?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      comp_off_requests: {
        Row: {
          id: string;
          user_id: string;
          work_date: string;
          hours_worked: number;
          reason: string | null;
          status: string;
          credit: number;
          approved_by: string | null;
          approved_at: string | null;
          expires_on: string | null;
          admin_note: string | null;
          created_at: string;
          timesheet_entry_id: string | null;
          auto_created: boolean;
          needs_reapproval: boolean;
          proposed_hours: number | null;
          proposed_credit: number | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          work_date: string;
          hours_worked: number;
          reason?: string | null;
          status?: string;
          credit?: number;
          approved_by?: string | null;
          approved_at?: string | null;
          expires_on?: string | null;
          admin_note?: string | null;
          created_at?: string;
          timesheet_entry_id?: string | null;
          auto_created?: boolean;
          needs_reapproval?: boolean;
          proposed_hours?: number | null;
          proposed_credit?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          work_date?: string;
          hours_worked?: number;
          reason?: string | null;
          status?: string;
          credit?: number;
          approved_by?: string | null;
          approved_at?: string | null;
          expires_on?: string | null;
          admin_note?: string | null;
          created_at?: string;
          timesheet_entry_id?: string | null;
          auto_created?: boolean;
          needs_reapproval?: boolean;
          proposed_hours?: number | null;
          proposed_credit?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "comp_off_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comp_off_requests_timesheet_entry_id_fkey";
            columns: ["timesheet_entry_id"];
            isOneToOne: false;
            referencedRelation: "work_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      holidays: {
        Row: {
          id: string;
          name: string;
          holiday_date: string;
          type: string;
          description: string | null;
          year: number;
          reviewed: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          holiday_date: string;
          type: string;
          description?: string | null;
          reviewed?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          holiday_date?: string;
          type?: string;
          description?: string | null;
          reviewed?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          calendar: string;
          owner_id: string;
          title: string;
          description: string | null;
          location: string | null;
          meeting_link: string | null;
          color: string;
          starts_on: string;
          ends_on: string;
          start_time: string | null;
          end_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          calendar: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          color?: string;
          starts_on: string;
          ends_on: string;
          start_time?: string | null;
          end_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          calendar?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          color?: string;
          starts_on?: string;
          ends_on?: string;
          start_time?: string | null;
          end_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
          comp_off: boolean;
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
          comp_off?: boolean;
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
          comp_off?: boolean;
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
          start_time: string | null;
          end_time: string | null;
          project: string | null;
          status: Database["public"]["Enums"]["log_status"];
          reviewed_by: string | null;
          reviewed_at: string | null;
          no_comp_off: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          log_date: string;
          content: string;
          hours?: number | null;
          created_at?: string;
          start_time?: string | null;
          end_time?: string | null;
          project?: string | null;
          status?: Database["public"]["Enums"]["log_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          no_comp_off?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          log_date?: string;
          content?: string;
          hours?: number | null;
          created_at?: string;
          start_time?: string | null;
          end_time?: string | null;
          project?: string | null;
          status?: Database["public"]["Enums"]["log_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          no_comp_off?: boolean;
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
      payroll_review_run: { Args: { p_run: string; p_reviewed: boolean }; Returns: undefined };
      payroll_finalize_run: { Args: { p_run: string; p_payslips: Json }; Returns: number };
      payroll_mark_paid: { Args: { p_run: string; p_paid_on: string }; Returns: undefined };
      payroll_reopen_run: { Args: { p_run: string; p_reason: string }; Returns: undefined };
      payroll_log_self: { Args: { p_action: string; p_payslip: string | null }; Returns: undefined };
      payroll_run_open: { Args: { p_run: string }; Returns: boolean };
      payroll_structure_visible: { Args: never; Returns: boolean };
      comp_off_decide_reapproval: { Args: { p_id: string; p_approve: boolean; p_note: string }; Returns: undefined };
      comp_off_credit_for: { Args: { h: number }; Returns: number };
      is_day_off: { Args: { d: string }; Returns: boolean };
      google_can_manage: { Args: { p_user: string }; Returns: boolean };
      google_clear_event: { Args: { p_request: string }; Returns: undefined };
      google_delete_connection: { Args: { p_user: string }; Returns: undefined };
      google_get_connection: { Args: { p_user: string }; Returns: string };
      google_get_event: { Args: { p_request: string }; Returns: string };
      google_is_connected: { Args: never; Returns: boolean };
      google_save_connection: { Args: { p_ciphertext: string; p_scope: string }; Returns: undefined };
      google_set_event: { Args: { p_request: string; p_event: string }; Returns: undefined };
      is_admin: { Args: never; Returns: boolean };
      portal_today: { Args: never; Returns: string };
      set_user_role: {
        Args: { target: string; new_role: Database["public"]["Enums"]["user_role"] };
        Returns: undefined;
      };
      week_is_open: { Args: { w: string }; Returns: boolean };
    };
    Enums: {
      log_status: "pending" | "approved" | "rejected";
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
